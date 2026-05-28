/**
 * Forge Effects — Side effects for the Forge system.
 *
 * Handles:
 *  - forgeRequested → start loop at step 1
 *  - forgeStepCompleted → schedule next step
 *  - forgeCritiqueReceived → write critique to FORGE_GUIDANCE field, end loop
 *  - entityDeleted → no-op (lorebook entry preserved)
 */

import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { GenX } from "nai-gen-x";
import {
  forgeRequested,
  forgeClearRequested,
  forgeLoopEnded,
  forgeStepCompleted,
  forgeCritiqueReceived,
  entityDeleted,
  entityRegenRequested,
  generationSubmitted,
  requestQueued,
  uiEntitySummaryGenerationRequested,
} from "../index";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { buildModelParams } from "../../utils/config";
import { IDS, STORAGE_KEYS } from "../../../ui/framework/ids";

export function registerForgeEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  _genX: GenX,
): void {
  // ─── Forge Requested ──────────────────────────────────────────────────────
  // Legacy forge loop — decommissioned. The typed-chat forge path
  // (forgeChatNewSessionRequested in forge-chat-effects.ts) is the sole entry point.

  subscribeEffect(matchesAction(forgeRequested), async () => {
    api.v1.log("[forge-effects] forgeRequested: legacy forge loop is decommissioned");
  });

  // ─── Forge Clear Requested → clear guidance input ─────────────────────────

  subscribeEffect(matchesAction(forgeClearRequested), async () => {
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_GUIDANCE_UI, "");
    api.v1.ui.updateParts([
      { id: IDS.FORGE.GUIDANCE_INPUT, value: "" },
    ]);
  });

  // ─── Forge Step Completed → schedule next step ────────────────────────────
  // Legacy forge loop — decommissioned.

  subscribeEffect(matchesAction(forgeStepCompleted), () => {
    api.v1.log("[forge-effects] forgeStepCompleted: legacy forge loop is decommissioned");
  });

  // ─── Forge Critique Received → write to FORGE_GUIDANCE field, end loop ───

  subscribeEffect(matchesAction(forgeCritiqueReceived), async ({ payload }) => {
    if (payload.critiqueText) {
      await api.v1.storyStorage.set(
        STORAGE_KEYS.FORGE_GUIDANCE_UI,
        payload.critiqueText,
      );
      api.v1.ui.updateParts([
        { id: IDS.FORGE.GUIDANCE_INPUT, value: payload.critiqueText },
      ]);
    }
    dispatch(forgeLoopEnded());
  });

  // ─── Entity Deleted → unbind only, never destroy the lorebook entry ─────────
  // Story Engine integrates but never destroys. Removing an entity from the
  // world only detaches it from SE management — the underlying lorebook entry
  // is preserved so the user can re-import or continue using it independently.
  subscribeEffect(matchesAction(entityDeleted), (_action) => {
    // intentionally no-op: lorebook entry is left intact
  });

  // ─── Entity Regen Requested → Queue only missing fields ───────────────────

  subscribeEffect(matchesAction(entityRegenRequested), async (action) => {
    const { entityId } = action.payload;
    const entity = getState().world.entitiesById[entityId];

    if (!entity?.lorebookEntryId) {
      api.v1.log(
        `[effects] entityRegenRequested: entity ${entityId} has no lorebook entry`,
      );
      return;
    }

    const { lorebookEntryId } = entity;
    const entry = await api.v1.lorebook.entry(lorebookEntryId);
    const hasSummary = !!entity.summary;
    const hasContent = !!entry?.text;
    const hasKeys = !!(entry?.keys && entry.keys.length > 0);

    if (!hasSummary) {
      const summaryRequestId = `se-entity-summary-${entityId}`;
      dispatch(requestQueued({ id: summaryRequestId, type: "entitySummary", targetId: entityId }));
      dispatch(uiEntitySummaryGenerationRequested({ entityId, requestId: summaryRequestId }));
    }

    if (!hasContent) {
      const contentRequestId = `lb-entity-${entityId}-content`;
      const contentFactory = createLorebookContentFactory(getState, lorebookEntryId);
      dispatch(
        generationSubmitted({
          requestId: contentRequestId,
          messageFactory: contentFactory,
          params: await buildModelParams({ max_tokens: 1024 }),
          target: { type: "lorebookContent", entryId: lorebookEntryId },
          prefillBehavior: "trim",
        }),
      );
    }

    if (!hasKeys) {
      const keysRequestId = `lb-entity-${entityId}-keys`;
      const keysPayload = await buildLorebookKeysPayload(getState, lorebookEntryId, keysRequestId);
      dispatch(generationSubmitted(keysPayload));
    }
  });

}
