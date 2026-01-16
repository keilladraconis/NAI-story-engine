import { Store } from "../store";
import { Action } from "../types";
import { RootState } from "../types";
import { ActionTypes } from "../actions";

const STORAGE_KEY = "kse-story-data";
const DEBOUNCE_MS = 1000;

export const persistenceMiddleware = (store: Store<RootState>) => {
  let timer: any = null;
  let lastState: any = null;

  return (next: (action: Action) => void) => (action: Action) => {
    const result = next(action);
    const state = store.getState();

    // Only save if story state changed
    if (state.story !== lastState) {
      lastState = state.story;

      // Skip saving on load
      if (action.type === ActionTypes.STORY_LOADED) return result;

      if (timer) api.v1.timers.clearTimeout(timer);
      timer = api.v1.timers.setTimeout(() => {
        api.v1.storyStorage
          .set(STORAGE_KEY, state.story)
          .catch((err) => api.v1.log("Failed to persist story data", err));
      }, DEBOUNCE_MS);
    }

    return result;
  };
};
