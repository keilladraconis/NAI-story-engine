import { combineReducers, createStore } from "./store";
import { RootState } from "./types";
import { initialStoryState, storyReducer } from "./reducers/storyReducer";
import { initialUIState, uiReducer } from "./reducers/uiReducer";
import { initialRuntimeState, runtimeReducer } from "./reducers/runtimeReducer";

// Create the store instance
export const store = createStore<RootState>(
  combineReducers({
    story: storyReducer,
    ui: uiReducer,
    runtime: runtimeReducer,
  }),
  {
    story: initialStoryState,
    ui: initialUIState,
    runtime: initialRuntimeState,
  },
);

// Helper to access dispatch easily
export const dispatch = store.dispatch;

// Helper to get state
export const getState = store.getState;

// Re-export everything
export * from "./types";
export * from "./actions";
export * from "./store";
