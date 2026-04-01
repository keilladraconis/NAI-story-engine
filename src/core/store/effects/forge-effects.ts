/**
 * Forge Effects — Side effects for the Forge system.
 *
 * Handles:
 *  - forgeRequested → create batch, start loop (step 1)
 *  - forgeStepCompleted → schedule next step
 *  - forgeCritiqueReceived → write critique to FORGE_GUIDANCE field, end loop
 *  - castAllRequested → create lorebook entries, move entities to live
 *  - batchReforged / entityReforged → pre-fill batch name input in UI
 */

import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { getModel } from "../../utils/config";
import { GenX } from "nai-gen-x";
import {
  forgeRequested,
  forgeClearRequested,
  forgeLoopStarted,
  forgeLoopEnded,
  forgeStepCompleted,
  forgeCritiqueReceived,
  worldCleared,
  castAllRequested,
  forgeCastCompleted,
  batchCreated,
  entityCast,
  entityCastRequested,
  batchReforged,
  entityReforged,
  entityReforgeRequested,
  entityRegenRequested,
  batchReforgeRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { buildForgeStrategy, FORGE_MAX_STEPS } from "../../utils/forge-strategy";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
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
  // Creates batch, starts the loop at step 1.

  subscribeEffect(matchesAction(forgeRequested), async () => {
    const guidanceRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FORGE_GUIDANCE_UI);
    const forgeGuidance = String(guidanceRaw || "").trim();

    const brainstormContext = forgeGuidance ? "" : getConsolidatedBrainstorm(getState());
    if (!forgeGuidance && !brainstormContext) {
      api.v1.ui.toast("Add forge guidance or run a brainstorm first", { type: "info" });
      return;
    }

    // Auto-default: "Main" for the very first forge; first 4 guidance words for subsequent
    const noBatches = getState().world.batches.length === 0;
    const guidanceWords = forgeGuidance.trim().split(/\s+/).slice(0, 4).join(" ");
    const defaultName = noBatches ? "Main" : (guidanceWords || "New Batch");

    const batchNameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FORGE_BATCH_NAME_UI);
    const batchName = String(batchNameRaw || "").trim() || defaultName;

    // If draft entities already exist, append to their batch (user hasn't cast yet).
    // Otherwise merge-on-match against live batches (reforge scenario), or mint a new ID.
    // Batch records for fresh drafts are deferred to Cast time.
    const existingDraftBatchId = getState().world.entities
      .find((e) => e.lifecycle === "draft")?.batchId ?? null;
    const existingLiveBatch = !existingDraftBatchId
      ? getState().world.batches.find((b) => b.name.toLowerCase() === batchName.toLowerCase())
      : null;
    const batchId = existingDraftBatchId ?? existingLiveBatch?.id ?? api.v1.uuid();

    // Pre-populate the batch name input so the user sees the auto-derived name
    if (!String(batchNameRaw || "").trim()) {
      await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, batchName);
      api.v1.ui.updateParts([{ id: IDS.FORGE.BATCH_NAME, value: batchName }]);
    }

    dispatch(forgeLoopStarted());

    const strategy = buildForgeStrategy(getState, batchId, 1, forgeGuidance, brainstormContext);
    dispatch(requestQueued({ id: strategy.requestId, type: "forge", targetId: batchId }));
    dispatch(generationSubmitted(strategy));
  });

  // ─── Forge Clear Requested → discard all drafts + clear inputs ───────────

  subscribeEffect(matchesAction(forgeClearRequested), async () => {
    dispatch(worldCleared());
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_GUIDANCE_UI, "");
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, "");
    api.v1.ui.updateParts([
      { id: IDS.FORGE.GUIDANCE_INPUT, value: "" },
      { id: IDS.FORGE.BATCH_NAME, value: "" },
    ]);
  });

  // ─── Forge Step Completed → schedule next step ────────────────────────────

  subscribeEffect(matchesAction(forgeStepCompleted), ({ payload }) => {
    const state = getState();
    if (!state.world.forgeLoopActive) {
      dispatch(forgeLoopEnded());
      return;
    }

    const nextStep = payload.step + 1;
    if (nextStep > FORGE_MAX_STEPS) {
      dispatch(forgeLoopEnded());
      return;
    }

    const strategy = buildForgeStrategy(getState, payload.batchId, nextStep, payload.forgeGuidance, payload.brainstormContext);
    dispatch(requestQueued({ id: strategy.requestId, type: "forge", targetId: payload.batchId }));
    dispatch(generationSubmitted(strategy));
  });

  // ─── Forge Critique Received → write to FORGE_INTENT field, end loop ──────

  subscribeEffect(matchesAction(forgeCritiqueReceived), async ({ payload }) => {
    if (payload.critiqueText) {
      await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_GUIDANCE_UI, payload.critiqueText);
      api.v1.ui.updateParts([{ id: IDS.FORGE.GUIDANCE_INPUT, value: payload.critiqueText }]);
    }
    dispatch(forgeLoopEnded());
  });

  // ─── Cast All Requested ───────────────────────────────────────────────────

  subscribeEffect(matchesAction(castAllRequested), async (_action, { getState: getLatest }) => {
    const state = getLatest();
    const draftEntities = state.world.entities.filter((e) => e.lifecycle === "draft");

    if (draftEntities.length === 0) {
      api.v1.ui.toast("No draft entities to cast", { type: "info" });
      return;
    }

    // Create any batch records that were deferred from forge time
    const batchNameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FORGE_BATCH_NAME_UI);
    const batchName = String(batchNameRaw || "").trim() || "Main";
    const pendingBatchIds = [...new Set(draftEntities.map((e) => e.batchId))];
    for (const batchId of pendingBatchIds) {
      if (!state.world.batches.some((b) => b.id === batchId)) {
        dispatch(batchCreated({ batch: { id: batchId, name: batchName, entityIds: [] } }));
      }
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
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_GUIDANCE_UI, "");
    await api.v1.storyStorage.set(STORAGE_KEYS.FORGE_BATCH_NAME_UI, "");
    api.v1.ui.updateParts([
      { id: IDS.FORGE.GUIDANCE_INPUT, value: "" },
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

  // ─── Entity Cast Requested → Cast a single draft entity to lorebook ─────────

  subscribeEffect(matchesAction(entityCastRequested), async (action) => {
    const { entityId } = action.payload;
    const state = getState();
    const entity = state.world.entities.find((e) => e.id === entityId);

    if (!entity || entity.lifecycle !== "draft") {
      api.v1.ui.toast("Entity is not a draft", { type: "info" });
      return;
    }

    await ensureCategory(entity.categoryId);

    const lorebookEntryId = await api.v1.lorebook.createEntry({
      id: api.v1.uuid(),
      displayName: entity.name,
      text: entity.summary ? `${entity.name}: ${entity.summary}` : entity.name,
      keys: [],
      enabled: true,
    });
    dispatch(entityCast({ entityId: entity.id, lorebookEntryId }));
    api.v1.ui.toast(`${entity.name} cast`, { type: "success" });
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

  // ─── Entity Regen Requested → Queue content + keys generation for one entity ─

  subscribeEffect(matchesAction(entityRegenRequested), async (action) => {
    const { entityId } = action.payload;
    const entity = getState().world.entities.find((e) => e.id === entityId);

    if (!entity?.lorebookEntryId) {
      api.v1.log(`[effects] entityRegenRequested: entity ${entityId} has no lorebook entry`);
      return;
    }

    const { lorebookEntryId } = entity;
    const contentRequestId = `lb-entity-${entityId}-content`;
    const keysRequestId = `lb-entity-${entityId}-keys`;

    // Content generation uses entity.summary (via createLorebookContentFactory) as the
    // item description, so the EntityCard summary is preserved as the source of truth
    // for the generated rich lorebook text. entity.summary in Redux is never touched.
    const contentFactory = createLorebookContentFactory(getState, lorebookEntryId);
    dispatch(generationSubmitted({
      requestId: contentRequestId,
      messageFactory: contentFactory,
      params: { model: await getModel(), max_tokens: 1024 },
      target: { type: "lorebookContent", entryId: lorebookEntryId },
      prefillBehavior: "trim",
    }));

    const keysPayload = await buildLorebookKeysPayload(getState, lorebookEntryId, keysRequestId);
    dispatch(generationSubmitted(keysPayload));
  });
}
