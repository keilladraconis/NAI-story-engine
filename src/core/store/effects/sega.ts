/**
 * S.E.G.A. (Story Engine Generate All) Effects
 *
 * Orchestrates automatic generation of story components in sequence:
 * 1. ATTG & Style (anchor tone/genre first)
 * 2. Canon (synthesize from world entries)
 * 3. Bootstrap (scene opening instruction, if document is empty)
 * 4. Lorebook (content + keys per entry)
 *
 * DULFS list population is handled by Crucible (v7). Users can still
 * generate items per-category via the "Generate Items" button.
 *
 * CACHE STRATEGY: All Story Engine strategies share a unified message prefix
 * (system prompt + weaving, cross-refs, story state). Content and keys for the
 * same entry have identical prefixes, so keys generation has near-zero uncached
 * tokens. Entries are generated in hash order for append-only cross-ref growth.
 */

import { Store, matchesAction } from "nai-store";
import { GenX } from "nai-gen-x";
import {
  RootState,
  DULFS_CATEGORIES,
  DulfsItem,
  AppDispatch,
} from "../types";
import { FieldID } from "../../../config/field-definitions";
import {
  segaToggled,
  segaStageSet,
  segaRequestTracked,
  segaRequestUntracked,
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
  createLorebookRelationalMapFactory,
  buildLorebookKeysPayload,
  MAP_DEPENDENCY_ORDER,
  parseNeedsReconciliation,
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
 * Check if Bootstrap is needed (document has no sections yet).
 */
async function needsBootstrap(): Promise<boolean> {
  const ids = await api.v1.document.sectionIds();
  return ids.length === 0;
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

/**
 * Find the next DULFS entry that needs a relational map.
 * Processes in MAP_DEPENDENCY_ORDER (characters first) so later entries
 * can reference earlier ones via MAP SO FAR.
 */
async function findEntryNeedingRelationalMap(state: RootState): Promise<DulfsItem | null> {
  const needsMap: Array<{ item: DulfsItem; orderIdx: number }> = [];
  const seed = await getStoryIdSeed();

  for (let i = 0; i < MAP_DEPENDENCY_ORDER.length; i++) {
    const fieldId = MAP_DEPENDENCY_ORDER[i];
    const items = state.story.dulfs[fieldId] || [];
    for (const item of items) {
      const entry = await api.v1.lorebook.entry(item.id);
      if (!entry?.text?.trim()) continue;
      if (!state.runtime.sega.relationalMaps[item.id]) {
        needsMap.push({ item, orderIdx: i });
      }
    }
  }

  if (needsMap.length === 0) return null;

  // Sort by dependency order first, then by hash within the same field
  needsMap.sort((a, b) => {
    if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
    return hashEntryPosition(seed, a.item.id) - hashEntryPosition(seed, b.item.id);
  });

  return needsMap[0].item;
}

/**
 * Find the next DULFS entry whose relational map needs reconciliation.
 * Targets entries with no primary characters and high collision risk —
 * these benefit from a second pass with the full map as context.
 */
async function findEntryNeedingReconciliation(state: RootState): Promise<DulfsItem | null> {
  const needsReconcile: DulfsItem[] = [];
  const seed = await getStoryIdSeed();

  for (const fieldId of MAP_DEPENDENCY_ORDER) {
    const items = state.story.dulfs[fieldId] || [];
    for (const item of items) {
      const mapText = state.runtime.sega.relationalMaps[item.id];
      if (mapText && parseNeedsReconciliation(mapText)) {
        needsReconcile.push(item);
      }
    }
  }

  if (needsReconcile.length === 0) return null;

  needsReconcile.sort(
    (a, b) => hashEntryPosition(seed, a.id) - hashEntryPosition(seed, b.id),
  );

  return needsReconcile[0];
}

/**
 * Find the next DULFS entry that needs keys generation.
 * Includes entries with no keys AND entries with only a stub key (a single key
 * equal to the entry's lowercased display name), which was inserted by the
 * content handler as a placeholder.
 */
async function findEntryNeedingKeys(state: RootState): Promise<DulfsItem | null> {
  const needsKeys: DulfsItem[] = [];
  const seed = await getStoryIdSeed();

  for (const category of DULFS_CATEGORIES) {
    const items = state.story.dulfs[category] || [];
    for (const item of items) {
      const entry = await api.v1.lorebook.entry(item.id);
      if (!entry?.text?.trim()) continue;
      const isStub =
        entry.keys?.length === 1 &&
        entry.keys[0] === (entry.displayName || "").toLowerCase();
      if (!isStub && entry.keys && entry.keys.length > 0) continue;
      needsKeys.push(item);
    }
  }

  if (needsKeys.length === 0) return null;

  needsKeys.sort(
    (a, b) => hashEntryPosition(seed, a.id) - hashEntryPosition(seed, b.id),
  );

  return needsKeys[0];
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
 * Queue a SEGA-initiated field generation and track the request ID.
 * Uses the same request ID pattern as the UI buttons for proper tracking.
 */
async function queueSegaFieldGeneration(
  dispatch: AppDispatch,
  getState: () => RootState,
  targetId: string,
): Promise<string> {
  const requestId = `gen-${targetId}`;

  const fieldName = targetId.replace("dulfs-", "");
  dispatch(segaStatusUpdated({ statusText: `Field: ${fieldName}` }));

  await enableSyncForField(targetId, dispatch, getState);

  dispatch(segaRequestTracked({ requestId }));
  dispatch(uiGenerationRequested({ id: requestId, type: "field", targetId }));

  return requestId;
}

/**
 * Queue lorebook content generation for a DULFS item.
 */
async function queueSegaLorebookContent(
  dispatch: AppDispatch,
  getState: () => RootState,
  item: DulfsItem,
): Promise<void> {
  const contentRequestId = `lb-item-${item.id}-content`;

  const entry = await api.v1.lorebook.entry(item.id);
  const name = entry?.displayName || item.id;
  const category = item.fieldId.replace("dulfs-", "");
  dispatch(
    segaStatusUpdated({ statusText: `Lorebook: ${category} - ${name}` }),
  );

  dispatch(segaRequestTracked({ requestId: contentRequestId }));

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
}

/**
 * Queue relational map generation for a DULFS item.
 * Same function handles both initial map pass and reconciliation —
 * the factory reads MAP SO FAR from state at JIT time.
 */
async function queueSegaRelationalMapGeneration(
  dispatch: AppDispatch,
  getState: () => RootState,
  item: DulfsItem,
): Promise<void> {
  const mapRequestId = `lb-item-${item.id}-relational-map`;

  const entry = await api.v1.lorebook.entry(item.id);
  const name = entry?.displayName || item.id;
  const category = item.fieldId.replace("dulfs-", "");
  dispatch(
    segaStatusUpdated({ statusText: `Relational Map: ${category} - ${name}` }),
  );

  dispatch(segaRequestTracked({ requestId: mapRequestId }));
  dispatch(
    generationSubmitted({
      requestId: mapRequestId,
      messageFactory: createLorebookRelationalMapFactory(getState, item.id),
      params: { model: "glm-4-6", max_tokens: 256 },
      target: { type: "lorebookRelationalMap", entryId: item.id },
      prefillBehavior: "trim",
    }),
  );
}

/**
 * Queue lorebook keys generation for a DULFS item.
 */
async function queueSegaLorebookKeys(
  dispatch: AppDispatch,
  getState: () => RootState,
  item: DulfsItem,
): Promise<void> {
  const keysRequestId = `lb-item-${item.id}-keys`;

  const entry = await api.v1.lorebook.entry(item.id);
  const name = entry?.displayName || item.id;
  const category = item.fieldId.replace("dulfs-", "");
  dispatch(
    segaStatusUpdated({ statusText: `Keys: ${category} - ${name}` }),
  );

  dispatch(segaRequestTracked({ requestId: keysRequestId }));
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
    await queueSegaFieldGeneration(dispatch, getState, FieldID.ATTG);
    return;
  }
  if (await needsStyle()) {
    api.v1.log("[sega] scheduling: style");
    dispatch(segaStageSet({ stage: "attgStyle" }));
    await queueSegaFieldGeneration(dispatch, getState, FieldID.Style);
    return;
  }

  // Stage 2: Canon (synthesize from world entries)
  if (await needsCanon(state)) {
    api.v1.log("[sega] scheduling: canon");
    dispatch(segaStageSet({ stage: "canon" }));
    await queueSegaFieldGeneration(dispatch, getState, FieldID.Canon);
    return;
  }

  // Stage 3: Bootstrap (scene opening instruction, if document is empty)
  if (await needsBootstrap()) {
    api.v1.log("[sega] scheduling: bootstrap");
    dispatch(segaStageSet({ stage: "bootstrap" }));
    const requestId = "gen-bootstrap";
    dispatch(segaStatusUpdated({ statusText: "Bootstrap: scene opening" }));
    dispatch(segaRequestTracked({ requestId }));
    dispatch(uiGenerationRequested({ id: requestId, type: "bootstrap", targetId: "bootstrap" }));
    return;
  }

  // Read skip flags once — used across multiple stages below
  const skipRelationalMap = (await api.v1.config.get("sega_skip_lorebook_relational_map")) || false;
  const skipKeys = (await api.v1.config.get("sega_skip_lorebook_keys")) || false;

  // Stage 4: Content (stub keys inserted by the content handler)
  const nextContent = await findEntryNeedingContent(state);
  if (nextContent) {
    api.v1.log(`[sega] scheduling: lorebook content ${nextContent.id.slice(0, 8)}`);
    dispatch(segaStageSet({ stage: "lorebookContent" }));
    await queueSegaLorebookContent(dispatch, getState, nextContent);
    return;
  }

  // Stage 5: Relational map (initial pass, dependency order)
  if (!skipRelationalMap) {
    const nextMap = await findEntryNeedingRelationalMap(state);
    if (nextMap) {
      api.v1.log(`[sega] scheduling: relational map ${nextMap.id.slice(0, 8)}`);
      dispatch(segaStageSet({ stage: "lorebookRelationalMap" }));
      await queueSegaRelationalMapGeneration(dispatch, getState, nextMap);
      return;
    }
  }

  // Stage 6: Reconcile (after all maps exist)
  if (!skipRelationalMap) {
    const nextReconcile = await findEntryNeedingReconciliation(state);
    if (nextReconcile) {
      api.v1.log(`[sega] scheduling: relational map reconcile ${nextReconcile.id.slice(0, 8)}`);
      dispatch(segaStageSet({ stage: "lorebookRelationalMapReconcile" }));
      await queueSegaRelationalMapGeneration(dispatch, getState, nextReconcile);
      return;
    }
  }

  // Stage 7: Keys — replaces stub keys with map-informed proper keys
  if (!skipKeys) {
    const nextKeys = await findEntryNeedingKeys(state);
    if (nextKeys) {
      api.v1.log(`[sega] scheduling: lorebook keys ${nextKeys.id.slice(0, 8)}`);
      dispatch(segaStageSet({ stage: "lorebookKeys" }));
      await queueSegaLorebookKeys(dispatch, getState, nextKeys);
      return;
    }
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
