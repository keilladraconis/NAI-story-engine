import { createStore, combineReducers, Action } from "nai-store";
import { brainstormSlice } from "./slices/brainstorm";
import { uiSlice } from "./slices/ui";
import { runtimeSlice } from "./slices/runtime";
import { storySlice, initialStoryState } from "./slices/story";
import { crucibleSlice, migrateCrucibleState } from "./slices/crucible";
import { RootState, StoryState, BrainstormMessage, CrucibleState } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted data loaded action
// ─────────────────────────────────────────────────────────────────────────────

interface PersistedData {
  story?: StoryState;
  brainstorm?: { messages: BrainstormMessage[] };
  crucible?: CrucibleState;
}

const PERSISTED_DATA_LOADED = "persist/loaded";

export const persistedDataLoaded = (data: PersistedData) => ({
  type: PERSISTED_DATA_LOADED as typeof PERSISTED_DATA_LOADED,
  payload: data,
});
persistedDataLoaded.type = PERSISTED_DATA_LOADED;

// ─────────────────────────────────────────────────────────────────────────────
// Root reducer with persist/loaded interception
// ─────────────────────────────────────────────────────────────────────────────

const sliceReducer = combineReducers({
  story: storySlice.reducer,
  brainstorm: brainstormSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
  crucible: crucibleSlice.reducer,
});

function rootReducer(state: RootState | undefined, action: Action): RootState {
  if (action.type === PERSISTED_DATA_LOADED) {
    const data = action.payload as PersistedData;
    const current = state ?? sliceReducer(undefined, { type: "@@INIT" });

    return {
      ...current,
      story: data.story
        ? { ...initialStoryState, ...data.story }
        : current.story,
      brainstorm: data.brainstorm?.messages
        ? { ...current.brainstorm, messages: data.brainstorm.messages }
        : current.brainstorm,
      crucible: data.crucible
        ? migrateCrucibleState(data.crucible)
        : current.crucible,
    };
  }

  return sliceReducer(state, action);
}

const debug = (await api.v1.config.get("story_engine_debug")) || false;

export const store = createStore<RootState>(rootReducer, debug);

// Export types
export * from "./types";
// Export actions
export * from "./slices/brainstorm";
export * from "./slices/ui";
export * from "./slices/runtime";
export * from "./slices/story";
export * from "./slices/crucible";
