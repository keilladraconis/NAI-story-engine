import { State, Action } from "../types";
import { ActionTypes } from "../actions";
import { storyReducer, initialStoryState } from "./storyReducer";
import { uiReducer, initialUIState } from "./uiReducer";
import { runtimeReducer, initialRuntimeState } from "./runtimeReducer";

export const initialRootState: State = {
  story: initialStoryState,
  ui: initialUIState,
  runtime: initialRuntimeState,
};

export function rootReducer(
  state: State = initialRootState,
  action: Action,
): State {
  switch (action.type) {
    case ActionTypes.STORY_CLEARED:
      return initialRootState;

    case ActionTypes.STORY_LOADED:
      return {
        story: storyReducer(initialStoryState, action),
        ui: initialUIState,
        runtime: initialRuntimeState,
      };

    default:
      return {
        story: storyReducer(state.story, action),
        ui: uiReducer(state.ui, action),
        runtime: runtimeReducer(state.runtime, action),
      };
  }
}
