/**
 * S.E.G.A. (Story Engine Generate All) Effects — v11
 *
 * Simplified two-stage pipeline per entity:
 *   1. Lorebook Content (generate entry text)
 *   2. Lorebook Keys (generate activation keys)
 *
 * Triggered on-demand via the SEGA toggle button.
 *
 * Works on Live entities with lorebookEntryIds (v11 world slice).
 * Dependency on ATTG/Style/Canon/Bootstrap removed — those are now
 * generated on-demand via Narrative Foundation.
 */

import { Store, matchesAction } from "nai-store";
import { GenX } from "nai-gen-x";
import { RootState, WorldEntity, AppDispatch } from "../types";
import {
  segaToggled,
  segaStageSet,
  segaRequestTracked,
  segaRequestUntracked,
  segaBulkUntracked,
  requestsBulkCompleted,
  segaReset,
  segaStatusUpdated,
  stateUpdated,
  requestCompleted,
  requestCancelled,
} from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { hashEntryPosition, getStoryIdSeed } from "../../utils/seeded-random";
import { buildModelParams } from "../../utils/config";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the next live entity that needs lorebook content generation.
 * Only considers entities with a lorebookEntryId and no entry text.
 */
async function findEntityNeedingContent(
  state: RootState,
): Promise<WorldEntity | null> {
  const liveEntities = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "live" && e.lorebookEntryId,
  );

  const needsContent: WorldEntity[] = [];
  for (const entity of liveEntities) {
    const entry = await api.v1.lorebook.entry(entity.lorebookEntryId!);
    if (!entry) continue;
    if (!entry.text || !entry.text.trim()) {
      needsContent.push(entity);
    }
  }

  if (needsContent.length === 0) return null;

  const seed = await getStoryIdSeed();
  needsContent.sort(
    (a, b) => hashEntryPosition(seed, a.id) - hashEntryPosition(seed, b.id),
  );

  api.v1.log(
    `[sega] findEntityNeedingContent: ${needsContent.length} need content, next: ${needsContent[0].name}`,
  );

  return needsContent[0];
}

/**
 * Find the next live entity that needs keys generation.
 * Includes entities with no keys AND entities with only the stub key
 * (displayName.toLowerCase()) inserted by the content handler.
 */
async function findEntityNeedingKeys(
  state: RootState,
): Promise<WorldEntity | null> {
  const liveEntities = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "live" && e.lorebookEntryId,
  );

  const needsKeys: WorldEntity[] = [];
  for (const entity of liveEntities) {
    if (state.runtime.sega.keysCompleted[entity.id]) continue;
    const entry = await api.v1.lorebook.entry(entity.lorebookEntryId!);
    if (!entry?.text?.trim()) continue;
    const isStub =
      entry.keys?.length === 1 &&
      entry.keys[0] === (entry.displayName || "").toLowerCase();
    if (!isStub && entry.keys && entry.keys.length > 0) continue;
    needsKeys.push(entity);
  }

  if (needsKeys.length === 0) return null;

  const seed = await getStoryIdSeed();
  needsKeys.sort(
    (a, b) => hashEntryPosition(seed, a.id) - hashEntryPosition(seed, b.id),
  );

  api.v1.log(
    `[sega] findEntityNeedingKeys: ${needsKeys.length} need keys, next: ${needsKeys[0].name}`,
  );

  return needsKeys[0];
}

/**
 * Queue lorebook content generation for a world entity.
 */
async function queueSegaLorebookContent(
  dispatch: AppDispatch,
  getState: () => RootState,
  entity: WorldEntity,
): Promise<void> {
  const entryId = entity.lorebookEntryId!;
  const contentRequestId = `lb-entity-${entity.id}-content`;

  dispatch(segaStatusUpdated({ statusText: `Lorebook: ${entity.name}` }));
  dispatch(segaRequestTracked({ requestId: contentRequestId }));

  const contentFactory = createLorebookContentFactory(getState, entryId);
  dispatch(
    generationSubmitted({
      requestId: contentRequestId,
      messageFactory: contentFactory,
      params: await buildModelParams({ max_tokens: 1024 }),
      target: { type: "lorebookContent", entryId },
      prefillBehavior: "trim",
    }),
  );
}

/**
 * Queue lorebook keys generation for a world entity.
 */
async function queueSegaLorebookKeys(
  dispatch: AppDispatch,
  getState: () => RootState,
  entity: WorldEntity,
): Promise<void> {
  const entryId = entity.lorebookEntryId!;
  const keysRequestId = `lb-entity-${entity.id}-keys`;

  dispatch(segaStatusUpdated({ statusText: `Keys: ${entity.name}` }));
  dispatch(segaRequestTracked({ requestId: keysRequestId }));

  const keysPayload = await buildLorebookKeysPayload(
    getState,
    entryId,
    keysRequestId,
  );
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

  for (const requestId of activeRequestIds) {
    genX.cancelQueued(requestId);
  }

  const activeRequest = getState().runtime.activeRequest;
  if (activeRequest && activeRequestIds.includes(activeRequest.id)) {
    dispatch(requestCancelled({ requestId: activeRequest.id }));
    genX.cancelAll();
    dispatch(stateUpdated({ genxState: { status: "idle", queueLength: 0 } }));
  }

  dispatch(segaBulkUntracked({ requestIds: activeRequestIds }));
  dispatch(requestsBulkCompleted({ requestIds: activeRequestIds }));
}

/**
 * Main SEGA orchestration: Content → Keys.
 */
async function scheduleNextSegaTask(
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<void> {
  const state = getState();

  if (!state.runtime.segaRunning) return;

  // Stage 1: Content
  const nextContent = await findEntityNeedingContent(state);
  if (nextContent) {
    api.v1.log(`[sega] scheduling: lorebook content for ${nextContent.name}`);
    dispatch(segaStageSet({ stage: "lorebookContent" }));
    await queueSegaLorebookContent(dispatch, getState, nextContent);
    return;
  }

  const skipKeys =
    (await api.v1.config.get("sega_skip_lorebook_keys")) || false;

  // Stage 2: Keys
  if (!skipKeys) {
    const nextKeys = await findEntityNeedingKeys(state);
    if (nextKeys) {
      api.v1.log(`[sega] scheduling: lorebook keys for ${nextKeys.name}`);
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
  // Effect 1: SEGA Toggle Handler (manual trigger)
  subscribeEffect(matchesAction(segaToggled), async (_action) => {
    const state = getState();

    if (state.runtime.segaRunning) {
      // SEGA was just turned ON
      dispatch(segaReset());
      await scheduleNextSegaTask(dispatch, getState);
    } else {
      // SEGA was just turned OFF
      cancelAllSegaTasks(getState, genX, dispatch);
      dispatch(segaReset());
    }
  });

  // Effect 3: Continuation on Request Completion
  subscribeEffect(matchesAction(requestCompleted), async (action) => {
    const { requestId } = action.payload;
    const state = getState();

    if (!state.runtime.sega.activeRequestIds.includes(requestId)) {
      return;
    }

    dispatch(segaRequestUntracked({ requestId }));

    const updated = getState();
    const remaining = updated.runtime.sega.activeRequestIds;
    if (remaining.length > 0) {
      api.v1.log(
        `[sega] ${requestId} done, waiting for ${remaining.length} paired: ${remaining.join(", ")}`,
      );
      return;
    }

    if (updated.runtime.segaRunning) {
      api.v1.log(`[sega] ${requestId} done — scheduling next`);
      await api.v1.timers.sleep(100);
      await scheduleNextSegaTask(dispatch, getState);
    } else {
      api.v1.log(`[sega] ${requestId} done, SEGA no longer running`);
    }
  });

  // Effect 4: Continuation on Request Cancellation
  subscribeEffect(matchesAction(requestCancelled), async (action) => {
    const { requestId } = action.payload;
    const state = getState();

    if (!state.runtime.sega.activeRequestIds.includes(requestId)) {
      return;
    }

    api.v1.log(`[sega] ${requestId} cancelled`);
    dispatch(segaRequestUntracked({ requestId }));

    const updated = getState();
    const remaining = updated.runtime.sega.activeRequestIds;
    if (remaining.length > 0) {
      api.v1.log(
        `[sega] waiting for ${remaining.length} paired: ${remaining.join(", ")}`,
      );
      return;
    }

    if (updated.runtime.segaRunning) {
      api.v1.log(
        `[sega] all paired complete after cancellation — scheduling next`,
      );
      await api.v1.timers.sleep(100);
      await scheduleNextSegaTask(dispatch, getState);
    }
  });
}
