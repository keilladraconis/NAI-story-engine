import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  storyCleared,
  queueCleared,
  foundationCleared,
  worldCleared,
} from "../index";

export function registerStoryEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // Storage Cleanup: Story Cleared
  subscribeEffect(matchesAction(storyCleared), async () => {
    const allKeys = await api.v1.storyStorage.list();
    const patternsToRemove = [
      /^kse-field-/,
      /^kse-sync-/,
      /^kse-section-/,
      /^draft-/,
      /^se-bs-input$/,
      /^cr-/,
      /^lb-/,
      /^se-fn-/,
      /^se-foundation-/,
      /^se-forge-/,
      /^se-world-/,
    ];

    for (const key of allKeys) {
      if (patternsToRemove.some((pattern) => pattern.test(key))) {
        await api.v1.storyStorage.remove(key);
      }
    }

    dispatch(foundationCleared());
    dispatch(worldCleared());
    dispatch(queueCleared());
  });
}
