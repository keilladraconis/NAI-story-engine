import { vi } from "vitest";

export type StoryStorageFake = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  keys(): string[];
};

/** In-memory `api.v1.storyStorage`.
 *
 *  `setIfAbsent` is modelled rather than stubbed: it is the write-once
 *  primitive the §5.2 snapshot depends on, and a stub returning a constant
 *  would hand its first caller green tests for a write that never happened —
 *  or, worse, for an overwrite that did. Same reasoning as the history fake's
 *  note on the same method. */
export function installStoryStorageFake(): StoryStorageFake {
  const data = new Map<string, unknown>();

  api.v1.storyStorage = {
    ...api.v1.storyStorage,
    get: vi.fn(async (key: string) => data.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      data.delete(key);
    }),
    has: vi.fn(async (key: string) => data.get(key) !== undefined),
    list: vi.fn(async () => [...data.keys()]),
    getOrDefault: vi.fn(async (key: string, fallback: unknown) => {
      const value = data.get(key);
      return value === undefined ? fallback : value;
    }),
    setIfAbsent: vi.fn(async (key: string, value: unknown) => {
      if (data.get(key) !== undefined) return false;
      data.set(key, value);
      return true;
    }),
  } as unknown as typeof api.v1.storyStorage;

  return {
    get: (key) => data.get(key),
    set: (key, value) => {
      data.set(key, value);
    },
    keys: () => [...data.keys()],
  };
}
