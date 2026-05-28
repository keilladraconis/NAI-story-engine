import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  generationSubmitted,
  uiEntitySummaryGenerationRequested,
  uiThreadSummaryGenerationRequested,
  entityBound,
  entitiesBoundBatch,
  requestQueued,
} from "../index";
import {
  createEntitySummaryFactory,
  createEntitySummaryFromLorebookFactory,
  createThreadSummaryFactory,
} from "../../utils/summary-strategy";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { buildModelParams } from "../../utils/config";

// Quick "generate this entity" intent fired by the entity card's lightning
// bolt. Fills only what's missing (summary, lorebook content, lorebook keys),
// so clicking it on a complete entity is a no-op and it never clobbers
// existing text. Lets a user queue a handful of entities before bootstrapping.
export interface EntityRegenRequestedPayload {
  entityId: string;
}
const ENTITY_REGEN_REQUESTED = "entity/regenRequested";
export const entityRegenRequested = (payload: EntityRegenRequestedPayload) => ({
  type: ENTITY_REGEN_REQUESTED as typeof ENTITY_REGEN_REQUESTED,
  payload,
});
entityRegenRequested.type = ENTITY_REGEN_REQUESTED;

export function registerSummaryGenerationEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  subscribeEffect(
    matchesAction(uiEntitySummaryGenerationRequested),
    async (action) => {
      const { entityId, requestId } = action.payload;
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createEntitySummaryFactory(getState, entityId),
          params: await buildModelParams({ max_tokens: 150, temperature: 0.9, min_p: 0.05 }),
          target: { type: "entitySummary", entityId },
          prefillBehavior: "trim",
        }),
      );
    },
  );

  subscribeEffect(matchesAction(entityBound), async (action) => {
    const { entity } = action.payload;
    if (!entity.lorebookEntryId) return;

    const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
    const entryText = entry?.text?.trim() ?? "";
    if (!entryText) return;

    const requestId = `entity-summary-bind-${entity.id}`;
    dispatch(requestQueued({ id: requestId, type: "entitySummaryBind", targetId: entity.id }));
    dispatch(
      generationSubmitted({
        requestId,
        messageFactory: createEntitySummaryFromLorebookFactory(getState, entity.id),
        params: await buildModelParams({ max_tokens: 150, temperature: 0.8, min_p: 0.05 }),
        target: { type: "entitySummaryBind", entityId: entity.id },
        prefillBehavior: "trim",
      }),
    );
  });

  subscribeEffect(matchesAction(entitiesBoundBatch), async (action) => {
    for (const entity of action.payload) {
      if (!entity.lorebookEntryId) continue;

      const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
      const entryText = entry?.text?.trim() ?? "";
      if (!entryText) continue;

      const requestId = `entity-summary-bind-${entity.id}`;
      dispatch(requestQueued({ id: requestId, type: "entitySummaryBind", targetId: entity.id }));
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createEntitySummaryFromLorebookFactory(getState, entity.id),
          params: await buildModelParams({ max_tokens: 150, temperature: 0.8, min_p: 0.05 }),
          target: { type: "entitySummaryBind", entityId: entity.id },
          prefillBehavior: "trim",
        }),
      );
    }
  });

  // Intent: generate whatever the entity is still missing, in one click.
  subscribeEffect(matchesAction(entityRegenRequested), async (action) => {
    const { entityId } = action.payload;
    const entity = getState().world.entitiesById[entityId];
    if (!entity?.lorebookEntryId) {
      api.v1.log(
        `[summary-generation] entityRegenRequested: ${entityId} has no lorebook entry — open the edit pane to author/cast it first`,
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
      dispatch(
        requestQueued({ id: summaryRequestId, type: "entitySummary", targetId: entityId }),
      );
      dispatch(uiEntitySummaryGenerationRequested({ entityId, requestId: summaryRequestId }));
    }

    if (!hasContent) {
      const contentRequestId = `lb-entity-${entityId}-content`;
      dispatch(
        requestQueued({ id: contentRequestId, type: "lorebookContent", targetId: lorebookEntryId }),
      );
      dispatch(
        generationSubmitted({
          requestId: contentRequestId,
          messageFactory: createLorebookContentFactory(getState, lorebookEntryId),
          params: await buildModelParams({ max_tokens: 1024 }),
          target: { type: "lorebookContent", entryId: lorebookEntryId },
          prefillBehavior: "trim",
        }),
      );
    }

    if (!hasKeys) {
      const keysRequestId = `lb-entity-${entityId}-keys`;
      dispatch(
        requestQueued({ id: keysRequestId, type: "lorebookKeys", targetId: lorebookEntryId }),
      );
      dispatch(
        generationSubmitted(
          await buildLorebookKeysPayload(getState, lorebookEntryId, keysRequestId),
        ),
      );
    }
  });

  subscribeEffect(
    matchesAction(uiThreadSummaryGenerationRequested),
    async (action) => {
      const { groupId, requestId } = action.payload;
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createThreadSummaryFactory(getState, groupId),
          params: await buildModelParams({ max_tokens: 100, temperature: 0.9, min_p: 0.05 }),
          target: { type: "threadSummary", groupId },
          prefillBehavior: "trim",
        }),
      );
    },
  );
}
