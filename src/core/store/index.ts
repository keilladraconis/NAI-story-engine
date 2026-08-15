import { createStore, combineReducers, Action } from "nai-store";
import { chatSlice } from "./slices/chat";
import type { ChatSliceState } from "./slices/chat";
import { uiSlice } from "./slices/ui";
import { runtimeSlice } from "./slices/runtime";
import { storySlice, initialStoryState } from "./slices/story";
import { worldSlice } from "./slices/world";
import { foundationSlice, initialFoundationState } from "./slices/foundation";
import { forgeSlice } from "./slices/forge";
import { RootState, StoryState, WorldState, FoundationState } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted data loaded action
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistedData {
  story?: StoryState;
  chat?: ChatSliceState;
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
  chat: chatSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
  world: worldSlice.reducer,
  foundation: foundationSlice.reducer,
  forge: forgeSlice.reducer,
});

/** Exported for tests: the persist/loaded replace semantics are load-bearing
 *  and deserve a direct test rather than one mediated by the store singleton. */
export function rootReducer(
  state: RootState | undefined,
  action: Action,
): RootState {
  if (action.type === PERSISTED_DATA_LOADED) {
    const data = action.payload as PersistedData;
    const current = state ?? sliceReducer(undefined, { type: "@@INIT" });

    return {
      ...current,
      story: data.story
        ? { ...initialStoryState, ...data.story }
        : current.story,
      chat: data.chat ?? current.chat,
      world: data.world ?? current.world,
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
// Chat slice exports — full surface, no longer competing with the legacy brainstorm slice.
export * from "./slices/chat";
export * from "./slices/ui";
export * from "./slices/runtime";
export * from "./slices/story";
export * from "./slices/world";
export * from "./slices/foundation";
export * from "./slices/forge";
export {
  forgeChatContinueRequested,
  entityDiscardRequested,
  forgeChatNewSessionRequested,
} from "./effects/forge-chat-effects";
