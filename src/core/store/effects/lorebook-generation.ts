import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  generationSubmitted,
  requestQueued,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
} from "../index";
import {
  createLorebookContentFactory,
  buildLorebookKeysPayload,
} from "../../utils/lorebook-strategy";
import { buildModelParams } from "../../utils/config";

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
          params: await buildModelParams({ max_tokens: 512 }),
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

      const keysPayload = await buildLorebookKeysPayload(
        getState,
        selectedEntryId,
        requestId,
      );
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
          params: await buildModelParams({ max_tokens: 512 }),
          target: { type: "lorebookContent", entryId },
          prefillBehavior: "trim",
        }),
      );

      const keysPayload = await buildLorebookKeysPayload(
        getState,
        entryId,
        keysRequestId,
      );
      dispatch(generationSubmitted(keysPayload));
    },
  );
}
