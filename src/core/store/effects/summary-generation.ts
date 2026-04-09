import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  generationSubmitted,
  uiEntitySummaryGenerationRequested,
  uiThreadSummaryGenerationRequested,
  entityBound,
  requestQueued,
} from "../index";
import {
  createEntitySummaryFactory,
  createEntitySummaryFromLorebookFactory,
  createThreadSummaryFactory,
} from "../../utils/summary-strategy";
import { getModel } from "../../utils/config";

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
          params: { model: await getModel(), max_tokens: 150, temperature: 0.9, min_p: 0.05 },
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
        params: { model: await getModel(), max_tokens: 150, temperature: 0.8, min_p: 0.05 },
        target: { type: "entitySummaryBind", entityId: entity.id },
        prefillBehavior: "trim",
      }),
    );
  });

  subscribeEffect(
    matchesAction(uiThreadSummaryGenerationRequested),
    async (action) => {
      const { groupId, requestId } = action.payload;
      dispatch(
        generationSubmitted({
          requestId,
          messageFactory: createThreadSummaryFactory(getState, groupId),
          params: { model: await getModel(), max_tokens: 100, temperature: 0.9, min_p: 0.05 },
          target: { type: "threadSummary", groupId },
          prefillBehavior: "trim",
        }),
      );
    },
  );
}
