import { createStore, combineReducers, Action } from "nai-store";
import { brainstormSlice } from "./slices/brainstorm";
import { uiSlice } from "./slices/ui";
import { runtimeSlice } from "./slices/runtime";
import { storySlice, initialStoryState } from "./slices/story";
import { crucibleSlice, initialCrucibleState } from "./slices/crucible";
import { worldSlice, initialWorldState } from "./slices/world";
import { foundationSlice, initialFoundationState } from "./slices/foundation";
import {
  RootState,
  StoryState,
  BrainstormChat,
  CrucibleState,
  WorldState,
  FoundationState,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted data loaded action
// ─────────────────────────────────────────────────────────────────────────────

interface PersistedData {
  story?: StoryState;
  brainstorm?: { chats: BrainstormChat[]; currentChatIndex: number };
  crucible?: CrucibleState;
  world?: WorldState;
  foundation?: FoundationState;
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
  world: worldSlice.reducer,
  foundation: foundationSlice.reducer,
});

function rootReducer(state: RootState | undefined, action: Action): RootState {
  if (action.type === PERSISTED_DATA_LOADED) {
    const data = action.payload as PersistedData;
    const current = state ?? sliceReducer(undefined, { type: "@@INIT" });

    return {
      ...current,
      story: data.story
        ? {
            ...initialStoryState,
            ...data.story,
            dulfs: { ...initialStoryState.dulfs, ...data.story?.dulfs },
          }
        : current.story,
      brainstorm: data.brainstorm?.chats
        ? {
            ...current.brainstorm,
            chats: data.brainstorm.chats,
            currentChatIndex: data.brainstorm.currentChatIndex,
          }
        : current.brainstorm,
      crucible: data.crucible
        ? { ...initialCrucibleState, ...data.crucible }
        : current.crucible,
      world: data.world
        ? { ...initialWorldState, ...data.world, forgeLoopActive: false }
        : current.world,
      foundation: data.foundation
        ? { ...initialFoundationState, ...data.foundation }
        : current.foundation,
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
export * from "./slices/world";
export * from "./slices/foundation";
