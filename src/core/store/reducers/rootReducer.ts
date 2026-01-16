import { RootState, Action } from "../types";
import { storyReducer, initialStoryState } from "./storyReducer";
import { uiReducer, initialUIState } from "./uiReducer";
import { runtimeReducer, initialRuntimeState } from "./runtimeReducer";

export const initialRootState: RootState = {
  story: initialStoryState,
  ui: initialUIState,
  runtime: initialRuntimeState,
};

export function rootReducer(state: RootState = initialRootState, action: Action): RootState {
  return {
    story: storyReducer(state.story, action),
    ui: uiReducer(state.ui, action),
    runtime: runtimeReducer(state.runtime, action),
  };
}
