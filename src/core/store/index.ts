import { createStore, combineReducers, type Action } from "nai-store";
import { canonSlice, initialCanonState } from "./slices/canon";
import { workshopSlice, initialWorkshopState } from "./slices/workshop";
import { distillSlice, initialDistillState } from "./slices/distill";
import { chatSlice, initialChatState } from "./slices/chat";
import { runtimeSlice } from "./slices/runtime";
import { uiSlice } from "./slices/ui";
import type { RootState } from "./types";

/** The story-scoped slices, as they are saved in storyStorage. */
export type PersistedData = Partial<
  Pick<RootState, "canon" | "workshop" | "distill" | "chat">
>;

const PERSISTED_LOADED = "persist/loaded";

export const persistedLoaded = (data: PersistedData) => ({
  type: PERSISTED_LOADED as typeof PERSISTED_LOADED,
  payload: data,
});
persistedLoaded.type = PERSISTED_LOADED;

const sliceReducer = combineReducers({
  canon: canonSlice.reducer,
  workshop: workshopSlice.reducer,
  distill: distillSlice.reducer,
  chat: chatSlice.reducer,
  runtime: runtimeSlice.reducer,
  ui: uiSlice.reducer,
});

export function rootReducer(
  state: RootState | undefined,
  action: Action,
): RootState {
  if (action.type !== PERSISTED_LOADED) return sliceReducer(state, action);
  const data = action.payload as PersistedData;
  const current = state ?? sliceReducer(undefined, { type: "@@INIT" });
  // Spread over the initial shape so a record saved before a field existed
  // still loads with every field present.
  return {
    ...current,
    canon: data.canon
      ? {
          ...initialCanonState,
          ...data.canon,
          brief: { ...initialCanonState.brief, ...data.canon.brief },
        }
      : current.canon,
    workshop: data.workshop
      ? { ...initialWorkshopState, ...data.workshop }
      : current.workshop,
    distill: data.distill
      ? { ...initialDistillState, ...data.distill }
      : current.distill,
    chat: data.chat ? { ...initialChatState, ...data.chat } : current.chat,
  };
}

const debug = Boolean(await api.v1.config.get("story_engine_debug"));

export const store = createStore<RootState>(rootReducer, debug);

export * from "./types";
export * from "./slices/canon";
export * from "./slices/workshop";
export * from "./slices/distill";
export * from "./slices/chat";
export * from "./slices/runtime";
export * from "./slices/ui";
