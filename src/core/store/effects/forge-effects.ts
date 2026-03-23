/**
 * Forge Effects — Side effects for the Forge system.
 *
 * Handles:
 *  - forgeRequested / forgeFromBrainstormRequested → build strategy, submit to GenX
 *  - castAllRequested → create lorebook entries, move entities to live
 *  - batchReforged / entityReforged → pre-fill batch name input in UI
 */

import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { GenX } from "nai-gen-x";
import {
  forgeRequested,
  castAllRequested,
  forgeCastCompleted,
  batchCreated,
  entityCast,
  batchReforged,
  entityReforged,
  entityReforgeRequested,
  batchReforgeRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { buildForgeStrategy } from "../../utils/forge-strategy";
import { ensureCategory } from "./lorebook-sync";
import { getConsolidatedBrainstorm } from "../../utils/context-builder";
import { IDS, STORAGE_KEYS } from "../../../ui/framework/ids";

export function registerForgeEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  _genX: GenX,
): void {
  // ─── Forge Requested ──────────────────────────────────────────────────────
  // If intent is blank, falls back to using the full brainstorm conversation as context.

  subscribeEffect(matchesAction(forgeRequested), async () => {
    const intentRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FORGE_INTENT_UI);
    const forgeIntent = String(intentRaw || "").trim();

    const brainstormContext = forgeIntent ? "" : getConsolidatedBrainstorm(getState());
    if (!forgeIntent && !brainstormContext) {
      api.v1.ui.toast("Add a forge intent or run a brainstorm first", { type: "info" });
      return;
    }

    const batchNameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FORGE_BATCH_NAME_UI);
    const batchName = String(batchNameRaw || "").trim() || "Draft";

    const batchId = api.v1.uuid();
    dispatch(batchCreated({ batch: { id: batchId, name: batchName, entityIds: [] } }));

    const strategy = buildForgeStrategy(getState, batchId, forgeIntent, brainstormContext);
    dispatch(requestQueued({ id: strategy.requestId, type: "forge", targetId: batchId }));
    dispatch(generationSubmitted(strategy));
  });

  // ─── Cast All Requested ───────────────────────────────────────────────────

  subscribeEffect(matchesAction(castAllRequested), async (_action, { getState: getLatest }) => {
    const state = getLatest();
    const draftEntities = state.world.entities.filter((e) => e.lifecycle === "draft");

    if (draftEntities.length === 0) {
      api.v1.ui.toast("No draft entities to cast", { type: "info" });
      return;
    }

    // Pre-create lorebook categories for all entity types (avoid races)
    const uniqueCategoryIds = [...new Set(draftEntities.map((e) => e.categoryId))];
    for (const categoryId of uniqueCategoryIds) {
      await ensureCategory(categoryId);
    }

    // Create lorebook entries and cast each entity
    let count = 0;
    for (const entity of draftEntities) {
      const lorebookEntryId = await api.v1.lorebook.createEntry({
        id: api.v1.uuid(),
        displayName: entity.name,
        text: entity.summary ? `${entity.name}: ${entity.summary}` : entity.name,
        keys: [],
        enabled: true,
      });
      dispatch(entityCast({ entityId: entity.id, lorebookEntryId }));
      count++;
    }

    dispatch(forgeCastCompleted());
    api.v1.log(`[forge] Cast ${count} entities to lorebook`);
    api.v1.ui.toast(`${count} ${count === 1 ? "entity" : "entities"} cast`, { type: "success" });

    // Clear forge intent and batch name inputs
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_INTENT_UI, "");
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, "");
    api.v1.ui.updateParts([
      { id: IDS.FORGE.INTENT_INPUT, value: "" },
      { id: IDS.FORGE.BATCH_NAME, value: "" },
    ]);
  });

  // ─── Batch Reforge Requested → Set entities to draft, pre-fill batch name ─

  subscribeEffect(matchesAction(batchReforgeRequested), async (action) => {
    const { batchId } = action.payload;
    const state = getState();
    const batch = state.world.batches.find((b) => b.id === batchId);

    // State change: move all entities in this batch to draft
    dispatch(batchReforged({ batchId }));

    // UI: pre-fill batch name input
    if (batch) {
      await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, batch.name);
      api.v1.ui.updateParts([{ id: IDS.FORGE.BATCH_NAME, value: batch.name }]);
    }
  });

  // ─── Entity Reforge Requested → Set entity to draft, pre-fill batch name ──

  subscribeEffect(matchesAction(entityReforgeRequested), async (action) => {
    const { entityId } = action.payload;
    const state = getState();
    const entity = state.world.entities.find((e) => e.id === entityId);

    // State change: move entity to draft, clear lorebookEntryId
    dispatch(entityReforged({ entityId }));

    // UI: pre-fill batch name input with entity's original batch
    if (entity) {
      const batch = state.world.batches.find((b) => b.id === entity.batchId);
      if (batch) {
        await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, batch.name);
        api.v1.ui.updateParts([{ id: IDS.FORGE.BATCH_NAME, value: batch.name }]);
      }
    }
  });
}
