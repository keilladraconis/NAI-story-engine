import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  generationSubmitted,
  requestQueued,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
  uiLorebookRefineRequested,
} from "../index";
import {
  createLorebookContentFactory,
  createLorebookRefineFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { IDS } from "../../../ui/framework/ids";

export function registerLorebookGenerationEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // Intent: Lorebook Content Generation
  subscribeEffect(
    matchesAction(uiLorebookContentGenerationRequested),
    async (action) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log(
          "[effects] No lorebook entry selected for content generation",
        );
        return;
      }

      const messageFactory = createLorebookContentFactory(
        getState,
        selectedEntryId,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 512 },
          target: { type: "lorebookContent", entryId: selectedEntryId },
          prefillBehavior: "trim",
        }),
      );
    },
  );

  // Intent: Lorebook Keys Generation
  subscribeEffect(
    matchesAction(uiLorebookKeysGenerationRequested),
    async (action) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for keys generation");
        return;
      }

      const keysPayload = await buildLorebookKeysPayload(getState, selectedEntryId, requestId);
      dispatch(generationSubmitted(keysPayload));
    },
  );

  // Intent: Lorebook Item Generation
  subscribeEffect(
    matchesAction(uiLorebookItemGenerationRequested),
    async (action) => {
      const { entryId, contentRequestId, keysRequestId } = action.payload;

      dispatch(
        requestQueued({
          id: contentRequestId,
          type: "lorebookContent",
          targetId: entryId,
        }),
      );
      dispatch(
        requestQueued({
          id: keysRequestId,
          type: "lorebookKeys",
          targetId: entryId,
        }),
      );

      const contentFactory = createLorebookContentFactory(getState, entryId);
      dispatch(
        generationSubmitted({
          requestId: contentRequestId,
          messageFactory: contentFactory,
          params: { model: "glm-4-6", max_tokens: 512 },
          target: { type: "lorebookContent", entryId },
          prefillBehavior: "trim",
        }),
      );

      const keysPayload = await buildLorebookKeysPayload(getState, entryId, keysRequestId);
      dispatch(generationSubmitted(keysPayload));
    },
  );

  // Intent: Lorebook Refine
  subscribeEffect(
    matchesAction(uiLorebookRefineRequested),
    async (action) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for refinement");
        return;
      }

      const getInstructions = async () =>
        String(
          (await api.v1.storyStorage.get(IDS.LOREBOOK.REFINE_INSTRUCTIONS_RAW)) ||
          "",
        );
      const messageFactory = createLorebookRefineFactory(
        getState,
        selectedEntryId,
        getInstructions,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 700 },
          target: { type: "lorebookRefine", entryId: selectedEntryId },
          prefillBehavior: "trim",
          continuation: { maxCalls: 3 },
        }),
      );
    },
  );
}
