import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../../ui/framework/ids";

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  // Save Story Effect (Autosave)
  subscribeEffect(
    (action) =>
      action.type.startsWith("story/") ||
      action.type.startsWith("brainstorm/") ||
      action.type.startsWith("crucible/"),
    async () => {
      try {
        const state = getState();
        const persistData = {
          story: state.story,
          brainstorm: state.brainstorm,
          crucible: state.crucible,
        };
        api.v1.storyStorage.set(STORAGE_KEYS.PERSIST, persistData);
      } catch (e) {
        /* ignore */
      }
    },
  );
}
