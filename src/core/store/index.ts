import { createStore, combineReducers, Action } from "nai-store";
import { chatSlice } from "./slices/chat";
import type { ChatSliceState } from "./slices/chat";
import { uiSlice } from "./slices/ui";
import { runtimeSlice } from "./slices/runtime";
import { storySlice, initialStoryState } from "./slices/story";
import { worldSlice, threadCreated } from "./slices/world";
import { foundationSlice, initialFoundationState } from "./slices/foundation";
import { forgeSlice } from "./slices/forge";
import { engineSlice } from "./slices/engine";
import { RootState, StoryState, WorldState, FoundationState } from "./types";
import { enforceThreadCap } from "../engine/thread-cap";

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
  engine: engineSlice.reducer,
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

  const next = sliceReducer(state, action);

  // The thread cap (§4.5), enforced where no callsite can dispatch around it —
  // the same argument as one-entity-per-lorebook-entry in slices/world.ts, one
  // level up. It is here rather than inside `threadCreated` because the cap is
  // one of the Engine's per-story settings and phase 4b already mirrored those
  // into the engine slice: a slice reducer cannot read another slice, and the
  // root is the only reducer that sees both. Mirroring the number a second time
  // into `WorldState` would have put a setting the Setup form owns inside the
  // World record, where every load would overwrite whatever the form last said.
  //
  // Only on a create. Lowering the cap deletes nothing by itself, and loading
  // the World is not a create — trimming there would spend a writer's threads
  // on opening the story.
  if (action.type === threadCreated.type) {
    const threads = enforceThreadCap(
      next.world.threads,
      next.engine.settings.threadCap,
    );
    if (threads !== next.world.threads) {
      return { ...next, world: { ...next.world, threads } };
    }
  }

  return next;
}

// nai-store logs `NAISTORE <action>` on EVERY dispatch when this is on, which is
// many lines per keystroke. It has its own setting rather than riding on
// story_engine_debug: that flag also gates the Engine's log lines, and sharing
// one switch meant reading what the Engine decided required turning on a
// firehose that buried it.
const logActions = (await api.v1.config.get("store_action_log")) || false;

export const store = createStore<RootState>(rootReducer, logActions);

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
export * from "./slices/engine";
export {
  forgeChatContinueRequested,
  entityDiscardRequested,
  forgeChatNewSessionRequested,
} from "./effects/forge-chat-effects";
// The HUD's ⚡ dispatches this; the engine effect runs the pass. The real
// re-entry guard is in the effect, not in the button (CLAUDE.md).
export { enginePassRequested } from "./effects/engine-loop";
