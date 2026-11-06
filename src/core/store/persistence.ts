// Loads the story-scoped slices once at startup and writes each back whenever
// its reference changes. One storyStorage record per slice; nothing here knows
// what is inside them.

import type { Store } from "nai-store";
import { STORAGE_KEYS } from "../keys";
import { persistedLoaded, type PersistedData } from "./index";
import type { RootState } from "./types";

const PERSISTED: ReadonlyArray<readonly [keyof PersistedData, string]> = [
  ["canon", STORAGE_KEYS.CANON],
  ["workshop", STORAGE_KEYS.WORKSHOP],
  ["distill", STORAGE_KEYS.DISTILL],
  ["chat", STORAGE_KEYS.CHAT],
];

export async function loadPersisted(store: Store<RootState>): Promise<void> {
  const data: PersistedData = {};
  for (const [slice, key] of PERSISTED) {
    const value = await api.v1.storyStorage.get(key);
    if (value) (data as Record<string, unknown>)[slice] = value;
  }
  store.dispatch(persistedLoaded(data));
}

export function savePersisted(store: Store<RootState>): void {
  for (const [slice, key] of PERSISTED) {
    store.subscribeSelector(
      (s) => s[slice],
      (value) => void api.v1.storyStorage.set(key, value),
    );
  }
}
