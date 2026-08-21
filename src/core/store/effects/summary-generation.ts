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
  buildLorebookContentPayload,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { buildModelParams } from "../../utils/config";
import { isRequestActive } from "../selectors/runtime";
import {
  entitySummaryRequestId,
  entitySummaryBindRequestId,
  lorebookContentRequestId,
  lorebookKeysRequestId,
} from "../../keys";

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
      const rt = getState().runtime;
      const alreadyTracked =
        rt.activeRequest?.id === requestId ||
        rt.queue.some((r) => r.id === requestId);
      if (!alreadyTracked) {
        dispatch(
          requestQueued({
            id: requestId,
            type: "entitySummary",
            targetId: entityId,
          }),
        );
      }
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createEntitySummaryFactory(getState, entityId),
          params: await buildModelParams(
            {
              max_tokens: 150,
              temperature: 0.9,
              min_p: 0.05,
            },
            "instruct",
          ),
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
    dispatch(
      requestQueued({
        id: requestId,
        type: "entitySummaryBind",
        targetId: entity.id,
      }),
    );
    dispatch(
      generationSubmitted({
        requestId,
        messageFactory: createEntitySummaryFromLorebookFactory(
          getState,
          entity.id,
        ),
        params: await buildModelParams(
          {
            max_tokens: 150,
            temperature: 0.8,
            min_p: 0.05,
          },
          "instruct",
        ),
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

      const requestId = entitySummaryBindRequestId(entity.id);
      dispatch(
        requestQueued({
          id: requestId,
          type: "entitySummaryBind",
          targetId: entity.id,
        }),
      );
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createEntitySummaryFromLorebookFactory(
            getState,
            entity.id,
          ),
          params: await buildModelParams(
            {
              max_tokens: 150,
              temperature: 0.8,
              min_p: 0.05,
            },
            "instruct",
          ),
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

    // The card's `pending` dims the button a render too late to stop a doubled
    // tap, and the lorebook read above is a far longer window than a tap guard
    // covers: both repeats resume here having seen the same "missing" state.
    // These ids are stable per entity, so a repeat is recognisable — skip any
    // that is already tracked. Each requestQueued below lands synchronously
    // before the next await, so a repeat resuming later sees all three.
    const alreadyQueued = (requestId: string) =>
      isRequestActive(getState().runtime, requestId);

    if (!hasSummary && !alreadyQueued(entitySummaryRequestId(entityId))) {
      const summaryRequestId = entitySummaryRequestId(entityId);
      dispatch(
        requestQueued({
          id: summaryRequestId,
          type: "entitySummary",
          targetId: entityId,
        }),
      );
      dispatch(
        uiEntitySummaryGenerationRequested({
          entityId,
          requestId: summaryRequestId,
        }),
      );
    }

    if (!hasContent && !alreadyQueued(lorebookContentRequestId(entityId))) {
      const contentRequestId = lorebookContentRequestId(entityId);
      dispatch(
        requestQueued({
          id: contentRequestId,
          type: "lorebookContent",
          targetId: lorebookEntryId,
        }),
      );
      dispatch(
        generationSubmitted(
          buildLorebookContentPayload(
            getState,
            lorebookEntryId,
            contentRequestId,
          ),
        ),
      );
    }

    if (!hasKeys && !alreadyQueued(lorebookKeysRequestId(entityId))) {
      const keysRequestId = lorebookKeysRequestId(entityId);
      dispatch(
        requestQueued({
          id: keysRequestId,
          type: "lorebookKeys",
          targetId: lorebookEntryId,
        }),
      );
      dispatch(
        generationSubmitted(
          await buildLorebookKeysPayload(
            getState,
            lorebookEntryId,
            keysRequestId,
          ),
        ),
      );
    }
  });

  subscribeEffect(
    matchesAction(uiThreadSummaryGenerationRequested),
    async (action) => {
      const { threadId, requestId } = action.payload;
      const rt = getState().runtime;
      const alreadyTracked =
        rt.activeRequest?.id === requestId ||
        rt.queue.some((r) => r.id === requestId);
      if (!alreadyTracked) {
        dispatch(
          requestQueued({
            id: requestId,
            type: "threadSummary",
            targetId: threadId,
          }),
        );
      }
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createThreadSummaryFactory(getState, threadId),
          params: await buildModelParams(
            {
              max_tokens: 100,
              temperature: 0.9,
              min_p: 0.05,
            },
            "instruct",
          ),
          target: { type: "threadSummary", threadId },
          prefillBehavior: "trim",
        }),
      );
    },
  );
}
