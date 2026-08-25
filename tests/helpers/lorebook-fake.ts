import { vi } from "vitest";

export type LorebookFake = {
  /** Put an entry in the book, as the writer's lorebook already holds it. */
  seed(entry: LorebookEntry): void;
  /** The entry as it stands now — what a real read would return. */
  read(id: string): LorebookEntry | undefined;
  /** Make the NEXT updateEntry reject. One shot, so a test can prove what
   *  survives a failed write without every later call failing too. */
  failNextUpdate(error: Error): void;
  /** Every updateEntry patch, in order. */
  updates(): { id: string; patch: Partial<LorebookEntry> }[];
  /** Every entry created through the API, in order — what the writer's lorebook
   *  gained that they did not put there. */
  created(): LorebookEntry[];
  /** The categories the book holds, as `{id, name}`. */
  categories(): { id: string; name?: string }[];
};

/** In-memory `api.v1.lorebook`, entries only.
 *
 *  `updateEntry` MERGES its patch, which is what the real API does — a patch
 *  carrying only `enabled` must not blank the text. A fake that replaced the
 *  entry would make the retire path look correct while it destroyed an entry. */
export function installLorebookFake(): LorebookFake {
  const entries = new Map<string, LorebookEntry>();
  const applied: { id: string; patch: Partial<LorebookEntry> }[] = [];
  const minted: LorebookEntry[] = [];
  const categories = new Map<string, LorebookCategory>();
  let nextFailure: Error | undefined;

  api.v1.lorebook = {
    ...api.v1.lorebook,
    entry: vi.fn(async (id: string) => entries.get(id) ?? null),
    entries: vi.fn(async () => [...entries.values()]),
    updateEntry: vi.fn(async (id: string, patch: Partial<LorebookEntry>) => {
      if (nextFailure) {
        const error = nextFailure;
        nextFailure = undefined;
        throw error;
      }
      const existing = entries.get(id);
      if (!existing) return;
      entries.set(id, { ...existing, ...patch });
      applied.push({ id, patch });
    }),
    // Creation is a different act from a write: it invents an entry rather than
    // editing one the writer owns, so it is the one lorebook call the Engine's
    // write door does not stand in front of — there is no live entry to read
    // first. The fake keeps them apart for the same reason.
    createEntry: vi.fn(async (entry: Partial<LorebookEntry>) => {
      const id = entry.id ?? api.v1.uuid();
      const stored = { ...entry, id } as LorebookEntry;
      entries.set(id, stored);
      minted.push(stored);
      return id;
    }),
    categories: vi.fn(async () => [...categories.values()]),
    createCategory: vi.fn(async (category: Partial<LorebookCategory>) => {
      const id = category.id ?? api.v1.uuid();
      categories.set(id, { ...category, id } as LorebookCategory);
      return id;
    }),
  } as unknown as typeof api.v1.lorebook;

  return {
    seed(entry) {
      entries.set(entry.id, entry);
    },
    read(id) {
      return entries.get(id);
    },
    failNextUpdate(error) {
      nextFailure = error;
    },
    updates() {
      return applied;
    },
    created() {
      return minted;
    },
    categories() {
      return [...categories.values()];
    },
  };
}
