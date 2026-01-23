import { createStore, combineReducers } from "../../../lib/nai-store";
import { brainstormSlice } from "./slices/brainstorm";
import { uiSlice } from "./slices/ui";
import { runtimeSlice } from "./slices/runtime";
import { storySlice } from "./slices/story";
import { RootState } from "./types";

const rootReducer = combineReducers({
  story: storySlice.reducer,
  brainstorm: brainstormSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
});

export const store = createStore<RootState>(rootReducer);

// Export types
export * from "./types";
// Export actions
export * from "./slices/brainstorm";
export * from "./slices/ui";
export * from "./slices/runtime";
export * from "./slices/story";
