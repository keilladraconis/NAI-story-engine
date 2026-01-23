import { combineReducers } from "../store";
import { storyReducer, initialStoryState } from "./storyReducer";
import { uiReducer, initialUIState } from "./uiReducer";
import { runtimeReducer, initialRuntimeState } from "./runtimeReducer";
import { RootState } from "../types";
import { Action } from "../store";

const appReducer = combineReducers({
  story: storyReducer,
  ui: uiReducer,
  runtime: runtimeReducer,
});

export const initialRootState: RootState = {
  story: initialStoryState,
  ui: initialUIState,
  runtime: initialRuntimeState,
};

export const rootReducer = (
  state: RootState = initialRootState,
  action: Action,
): RootState => {
  if (action.type === "story/cleared") {
    return initialRootState;
  }

  if (action.type === "story/loaded") {
    // Reset to initial state, allowing reducers to handle the load action
    // (storyReducer handles story/loaded by populating the story)
    return appReducer(initialRootState, action);
  }

  return appReducer(state, action);
};
