/**
 * S.E.G.A. (Story Engine Generate All) Effects
 *
 * Orchestrates automatic generation of story components in sequence:
 * 1. ATTG & Style (anchor tone/genre first)
 * 2. DULFS Lists (round-robin until each has MIN_ITEMS_PER_CATEGORY items)
 * 3. Canon (synthesize from world entries)
 * 4. Lorebook (content + keys per entry)
 *
 * CACHE STRATEGY: All Story Engine strategies share a unified message prefix
 * (system prompt + weaving, cross-refs, story state). Content and keys for the
 * same entry have identical prefixes, so keys generation has near-zero uncached
 * tokens. Entries are generated in hash order for append-only cross-ref growth.
 */

import { Store, matchesAction } from "../../../../lib/nai-store";
import { GenX } from "../../../../lib/gen-x";
import {
  RootState,
  DULFS_CATEGORIES,
  MIN_ITEMS_PER_CATEGORY,
  DulfsItem,
  AppDispatch,
} from "../types";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  segaToggled,
  segaStageSet,
  segaRequestTracked,
  segaRequestUntracked,
  segaRoundRobinAdvanced,
  segaReset,
  segaStatusUpdated,
  uiGenerationRequested,
  requestCompleted,
  requestCancelled,
} from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import { attgToggled, styleToggled } from "../slices/story";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { hashEntryPosition, getStoryIdSeed } from "../../utils/seeded-random";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if Canon needs generation.
 */
async function needsCanon(state: RootState): Promise<boolean> {
  const content = state.story.fields[FieldID.Canon]?.content?.trim();
  return !content;
}

/**
 * Check if ATTG field needs generation.
 */
async function needsATTG(): Promise<boolean> {
  const content = await api.v1.storyStorage.get("kse-field-attg");
  return !content || !String(content).trim();
}

/**
 * Check if Style field needs generation.
 */
async function needsStyle(): Promise<boolean> {
  const content = await api.v1.storyStorage.get("kse-field-style");
  return !content || !String(content).trim();
}

/**
 * Get the next DULFS category that needs items, using round-robin.
 * Returns null if all categories have sufficient items.
 */
function getNextDulfsCategory(state: RootState): DulfsFieldID | null {
  const { currentIndex } = state.runtime.sega.dulfsRoundRobin;

  // Scan from current index looking for a category that needs items
  for (let i = 0; i < DULFS_CATEGORIES.length; i++) {
    const idx = (currentIndex + i) % DULFS_CATEGORIES.length;
    const category = DULFS_CATEGORIES[idx];
    const items = state.story.dulfs[category] || [];

    if (items.length < MIN_ITEMS_PER_CATEGORY) {
      return category;
    }
  }

  return null; // All categories have enough items
}

/**
 * Find the next DULFS entry that needs content generation.
 * Entries are sorted by hash position (matching cross-reference order)
 * so SEGA generates them in an order that produces append-only cache growth.
 * Returns null if all entries have content.
 */
async function findEntryNeedingContent(state: RootState): Promise<DulfsItem | null> {
  const needsContent: DulfsItem[] = [];
  let totalEntries = 0;
  let withContent = 0;
  let noEntry = 0;

  for (const category of DULFS_CATEGORIES) {
    const items = state.story.dulfs[category] || [];
    for (const item of items) {
      totalEntries++;
      const entry = await api.v1.lorebook.entry(item.id);
      if (!entry) {
        noEntry++;
        continue;
      }

      if (!entry.text || !entry.text.trim()) {
        needsContent.push(item);
      } else {
        withContent++;
      }
    }
  }

  api.v1.log(
    `[sega] findEntryNeedingContent: ${totalEntries} total, ${withContent} with content, ${needsContent.length} need content, ${noEntry} no entry`,
  );

  if (needsContent.length === 0) return null;

  // Sort by hash position for cache-optimal ordering
  const seed = await getStoryIdSeed();
  needsContent.sort(
    (a, b) => hashEntryPosition(seed, a.id) - hashEntryPosition(seed, b.id),
  );

  const nextEntry = await api.v1.lorebook.entry(needsContent[0].id);
  api.v1.log(
    `[sega] next entry: ${nextEntry?.displayName || needsContent[0].id.slice(0, 8)} (${needsContent[0].fieldId})`,
  );

  return needsContent[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// SEGA Orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enable sync toggle for ATTG/Style fields.
 * - Sets storage key for sync checkbox (checkbox UI auto-syncs via storageKey binding)
 * - Dispatches state toggle if not already enabled
 * This ensures SEGA-generated content is synced to Memory/Author's Note.
 */
async function enableSyncForField(
  fieldId: string,
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<void> {
  if (fieldId === FieldID.ATTG) {
    // Enable the sync storage key
    await api.v1.storyStorage.set("kse-sync-attg-memory", true);
    // Enable ATTG in state if not already enabled
    if (!getState().story.attgEnabled) {
      dispatch(attgToggled());
    }
  } else if (fieldId === FieldID.Style) {
    // Enable the sync storage key
    await api.v1.storyStorage.set("kse-sync-style-an", true);
    // Enable Style in state if not already enabled
    if (!getState().story.styleEnabled) {
      dispatch(styleToggled());
    }
  }
}

/**
 * Queue a SEGA-initiated generation and track the request ID.
 * Uses the same request ID pattern as the UI buttons for proper tracking.
 */
async function queueSegaGeneration(
  dispatch: AppDispatch,
  getState: () => RootState,
  type: "field" | "list",
  targetId: string,
): Promise<string> {
  // Use the same request ID pattern as GenerationButton for proper UI tracking
  // Fields: gen-{fieldId}, Lists: gen-list-{fieldId}
  const requestId =
    type === "field" ? `gen-${targetId}` : `gen-list-${targetId}`;

  // Update status text
  const fieldName = targetId.replace("dulfs-", "");
  const label = type === "list" ? `List: ${fieldName}` : `Field: ${fieldName}`;
  dispatch(segaStatusUpdated({ statusText: label }));

  // Enable sync for ATTG/Style before generation
  if (type === "field") {
    await enableSyncForField(targetId, dispatch, getState);
  }

  // Track this request as SEGA-initiated
  dispatch(segaRequestTracked({ requestId }));

  // Queue the generation request
  dispatch(
    uiGenerationRequested({
      id: requestId,
      type,
      targetId,
    }),
  );

  return requestId;
}

/**
 * Queue lorebook content + keys generation for a DULFS item.
 * With the unified prefix, content and keys share the same message prefix,
 * so keys generation immediately after content has near-zero uncached tokens.
 */
async function queueSegaLorebookGeneration(
  dispatch: AppDispatch,
  getState: () => RootState,
  item: DulfsItem,
): Promise<void> {
  const contentRequestId = `lb-item-${item.id}-content`;
  const keysRequestId = `lb-item-${item.id}-keys`;

  // Update status text with category and entry name
  const entry = await api.v1.lorebook.entry(item.id);
  const name = entry?.displayName || item.id;
  const category = item.fieldId.replace("dulfs-", "");
  dispatch(
    segaStatusUpdated({ statusText: `Lorebook: ${category} - ${name}` }),
  );

  // Track both as SEGA-initiated
  dispatch(segaRequestTracked({ requestId: contentRequestId }));
  dispatch(segaRequestTracked({ requestId: keysRequestId }));

  // Queue content generation
  const contentFactory = createLorebookContentFactory(getState, item.id);
  dispatch(
    generationSubmitted({
      requestId: contentRequestId,
      messageFactory: contentFactory,
      params: { model: "glm-4-6", max_tokens: 700 },
      target: { type: "lorebookContent", entryId: item.id },
      prefillBehavior: "trim",
    }),
  );

  // Queue keys generation (runs after content; factory fetches fresh entry.text)
  const keysPayload = await buildLorebookKeysPayload(getState, item.id, keysRequestId);
  dispatch(generationSubmitted(keysPayload));
}

/**
 * Cancel all SEGA-tracked requests.
 */
function cancelAllSegaTasks(
  getState: () => RootState,
  genX: GenX,
  dispatch: AppDispatch,
): void {
  const { activeRequestIds } = getState().runtime.sega;

  // Cancel queued requests
  for (const requestId of activeRequestIds) {
    genX.cancelQueued(requestId);
  }

  // Cancel current if SEGA-initiated
  const activeRequest = getState().runtime.activeRequest;
  if (activeRequest && activeRequestIds.includes(activeRequest.id)) {
    genX.cancelAll();
  }

  // Clear tracking
  for (const requestId of activeRequestIds) {
    dispatch(segaRequestUntracked({ requestId }));
  }
}

/**
 * Main SEGA orchestration function.
 * Determines and schedules the next task in the pipeline.
 */
async function scheduleNextSegaTask(
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<void> {
  const state = getState();

  // Check if SEGA is still running
  if (!state.runtime.segaRunning) return;

  // Stage 1: ATTG & Style (anchor tone/genre first)
  if (await needsATTG()) {
    api.v1.log("[sega] scheduling: attg");
    dispatch(segaStageSet({ stage: "attgStyle" }));
    await queueSegaGeneration(dispatch, getState, "field", FieldID.ATTG);
    return;
  }
  if (await needsStyle()) {
    api.v1.log("[sega] scheduling: style");
    dispatch(segaStageSet({ stage: "attgStyle" }));
    await queueSegaGeneration(dispatch, getState, "field", FieldID.Style);
    return;
  }

  // Stage 2: DULFS Lists (round-robin)
  const nextCategory = getNextDulfsCategory(state);
  if (nextCategory) {
    api.v1.log(`[sega] scheduling: list ${nextCategory}`);
    dispatch(segaStageSet({ stage: "dulfsLists" }));
    await queueSegaGeneration(dispatch, getState, "list", nextCategory);
    dispatch(segaRoundRobinAdvanced());
    return;
  }

  // Stage 3: Canon (synthesize from world entries)
  if (await needsCanon(state)) {
    api.v1.log("[sega] scheduling: canon");
    dispatch(segaStageSet({ stage: "canon" }));
    await queueSegaGeneration(dispatch, getState, "field", FieldID.Canon);
    return;
  }

  // Stage 4: Lorebook (content + keys per entry, unified prefix)
  const nextEntry = await findEntryNeedingContent(state);
  if (nextEntry) {
    api.v1.log(`[sega] scheduling: lorebook ${nextEntry.id.slice(0, 8)}`);
    dispatch(segaStageSet({ stage: "lorebookContent" }));
    await queueSegaLorebookGeneration(dispatch, getState, nextEntry);
    return;
  }

  // All done!
  api.v1.log("[sega] all stages complete");
  dispatch(segaStageSet({ stage: "completed" }));
  dispatch(segaToggled()); // Turn off SEGA
  api.v1.ui.toast("S.E.G.A. Complete!", { type: "success" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerSegaEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  genX: GenX,
): void {
  // Effect 1: SEGA Toggle Handler
  subscribeEffect(matchesAction(segaToggled), async (_action) => {
    const state = getState();

    if (state.runtime.segaRunning) {
      // SEGA was just turned ON (state already updated by reducer)
      dispatch(segaReset());
      await scheduleNextSegaTask(dispatch, getState);
    } else {
      // SEGA was just turned OFF
      cancelAllSegaTasks(getState, genX, dispatch);
      dispatch(segaReset());
    }
  });

  // Effect 2: Continuation on Request Completion
  subscribeEffect(matchesAction(requestCompleted), async (action) => {
    const { requestId } = action.payload;
    const state = getState();

    // Check if this was a SEGA-initiated request
    if (!state.runtime.sega.activeRequestIds.includes(requestId)) {
      return;
    }

    // Untrack the completed request
    dispatch(segaRequestUntracked({ requestId }));

    // Wait for ALL paired requests to finish before scheduling next task.
    // content+keys are queued together — scheduling on content completion
    // would queue the NEXT entry before keys runs, causing double-generation.
    const updated = getState();
    const remaining = updated.runtime.sega.activeRequestIds;
    if (remaining.length > 0) {
      api.v1.log(`[sega] ${requestId} done, waiting for ${remaining.length} paired: ${remaining.join(", ")}`);
      return;
    }

    if (updated.runtime.segaRunning) {
      api.v1.log(`[sega] ${requestId} done, all paired complete — scheduling next`);
      await api.v1.timers.sleep(100);
      await scheduleNextSegaTask(dispatch, getState);
    } else {
      api.v1.log(`[sega] ${requestId} done, but SEGA no longer running`);
    }
  });

  // Effect 3: Continuation on Request Cancellation
  subscribeEffect(matchesAction(requestCancelled), async (action) => {
    const { requestId } = action.payload;
    const state = getState();

    // Check if this was a SEGA-initiated request
    if (!state.runtime.sega.activeRequestIds.includes(requestId)) {
      return;
    }

    api.v1.log(`[sega] ${requestId} cancelled`);

    // Untrack the cancelled request
    dispatch(segaRequestUntracked({ requestId }));

    // Wait for ALL paired requests to finish before scheduling next
    const updated = getState();
    const remaining = updated.runtime.sega.activeRequestIds;
    if (remaining.length > 0) {
      api.v1.log(`[sega] waiting for ${remaining.length} paired: ${remaining.join(", ")}`);
      return;
    }

    if (updated.runtime.segaRunning) {
      api.v1.log(`[sega] all paired complete after cancellation — scheduling next`);
      await api.v1.timers.sleep(100);
      await scheduleNextSegaTask(dispatch, getState);
    }
  });
}
