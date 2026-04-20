import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../../ui/framework/ids";

const AUTOSAVE_DELAY_MS = 2000;

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  // Cancellation-flag debounce: avoids storing the async timer ID.
  let _cancel: (() => void) | null = null;

  subscribeEffect(
    (action) =>
      action.type.startsWith("story/") ||
      action.type.startsWith("brainstorm/") ||
      action.type.startsWith("world/") ||
      action.type.startsWith("foundation/"),
    () => {
      if (_cancel !== null) {
        _cancel();
      }
      let cancelled = false;
      _cancel = () => {
        cancelled = true;
      };
      void api.v1.timers.setTimeout(() => {
        if (cancelled) return;
        _cancel = null;
        try {
          const state = getState();
          const persistData = {
            story: state.story,
            brainstorm: state.brainstorm,
            world: state.world,
            foundation: state.foundation,
          };
          api.v1.storyStorage.set(STORAGE_KEYS.PERSIST, persistData);
        } catch (e) {
          /* ignore */
        }
      }, AUTOSAVE_DELAY_MS);
    },
  );
}
