import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ensureCategory,
  migrateLorebookCategories,
  syncEratoCompatibility,
} from "../../../../src/core/store/effects/lorebook-sync";
import type { RootState } from "../../../../src/core/store/types";
import { FieldID } from "../../../../src/config/field-definitions";

/**
 * Minimal in-memory stand-in for the lorebook category/entry API, wired onto
 * the global `api.v1.lorebook` mock. `createCategory` appends without checking
 * for an existing name — exactly like the real API — so a check-then-create
 * race shows up as two categories with the same name.
 */
function installLorebook(
  categories: LorebookCategory[] = [],
  entries: Partial<LorebookEntry>[] = [],
) {
  let next = 0;
  api.v1.lorebook.categories = vi.fn(async () => [...categories]);
  api.v1.lorebook.createCategory = vi.fn(
    async (category: Partial<LorebookCategory>) => {
      const id = category.id ?? `cat-${++next}`;
      categories.push({ ...category, id } as LorebookCategory);
      return id;
    },
  );
  api.v1.lorebook.removeCategory = vi.fn(async (id: string) => {
    const at = categories.findIndex((c) => c.id === id);
    if (at >= 0) categories.splice(at, 1);
  });
  api.v1.lorebook.updateCategory = vi.fn(
    async (id: string, patch: Partial<LorebookCategory>) => {
      const category = categories.find((c) => c.id === id);
      if (category) Object.assign(category, patch);
    },
  );
  api.v1.lorebook.entries = vi.fn(async () => [...entries] as LorebookEntry[]);
  api.v1.lorebook.updateEntry = vi.fn(
    async (id: string, patch: Partial<LorebookEntry>) => {
      const entry = entries.find((e) => e.id === id);
      if (entry) Object.assign(entry, patch);
    },
  );
  // syncEratoCompatibility reads entries and categories one at a time; the
  // other suites here only ever use the list forms.
  api.v1.lorebook.entry = vi.fn(
    async (id: string) =>
      (entries.find((e) => e.id === id) as LorebookEntry) ?? null,
  );
  api.v1.lorebook.removeEntry = vi.fn(async (id: string) => {
    const at = entries.findIndex((e) => e.id === id);
    if (at >= 0) entries.splice(at, 1);
  });
  api.v1.lorebook.category = vi.fn(
    async (id: string) => categories.find((c) => c.id === id) ?? null,
  );
  return { categories, entries };
}

/** Enough RootState for `syncEratoCompatibility`, which reads exactly two
 *  collections and nothing else. */
function worldOf(
  entities: { lorebookEntryId?: string }[] = [],
  threads: { lorebookEntryId?: string }[] = [],
) {
  return () =>
    ({
      world: {
        entitiesById: Object.fromEntries(
          entities.map((e, i) => [`e${i}`, { id: `e${i}`, ...e }]),
        ),
        threads: threads.map((t, i) => ({ id: `t${i}`, ...t })),
      },
      // The same call re-syncs ATTG → Memory and Style → A/N. Both switches
      // off, so these tests measure the lorebook half and nothing else.
      foundation: {
        attg: "",
        style: "",
        attgSyncEnabled: false,
        styleSyncEnabled: false,
      },
    }) as unknown as RootState;
}

const eratoMode = (on: boolean) =>
  vi
    .mocked(api.v1.config.get)
    .mockImplementation(async (key: string) =>
      key === "erato_compatibility" ? on : undefined,
    );

describe("ensureCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the category once when it does not exist", async () => {
    const book = installLorebook();

    const id = await ensureCategory(FieldID.DramatisPersonae);

    expect(book.categories).toHaveLength(1);
    expect(book.categories[0].name).toBe("SE: Characters");
    expect(book.categories[0].id).toBe(id);
  });

  it("reuses an existing category instead of creating a second one", async () => {
    const book = installLorebook([{ id: "existing", name: "SE: Characters" }]);

    const id = await ensureCategory(FieldID.DramatisPersonae);

    expect(id).toBe("existing");
    expect(api.v1.lorebook.createCategory).not.toHaveBeenCalled();
    expect(book.categories).toHaveLength(1);
  });

  // The Cast All regression: one effect fires per draft, so N drafts sharing a
  // category call ensureCategory concurrently. Each used to miss the lookup and
  // create its own duplicate.
  it("collapses concurrent calls for the same category into one create", async () => {
    const book = installLorebook();

    const ids = await Promise.all([
      ensureCategory(FieldID.DramatisPersonae),
      ensureCategory(FieldID.DramatisPersonae),
      ensureCategory(FieldID.DramatisPersonae),
      ensureCategory(FieldID.DramatisPersonae),
    ]);

    expect(api.v1.lorebook.createCategory).toHaveBeenCalledTimes(1);
    expect(book.categories).toHaveLength(1);
    expect(new Set(ids).size).toBe(1);
  });

  it("still creates distinct categories for concurrent calls across fields", async () => {
    const book = installLorebook();

    const [characters, locations] = await Promise.all([
      ensureCategory(FieldID.DramatisPersonae),
      ensureCategory(FieldID.Locations),
    ]);

    expect(characters).not.toBe(locations);
    expect(book.categories.map((c) => c.name).sort()).toEqual([
      "SE: Characters",
      "SE: Locations",
    ]);
  });

  it("re-reads the lorebook on a later call rather than caching the id", async () => {
    const book = installLorebook();

    const first = await ensureCategory(FieldID.DramatisPersonae);
    // User deletes the category out from under us.
    book.categories.length = 0;
    const second = await ensureCategory(FieldID.DramatisPersonae);

    expect(api.v1.lorebook.createCategory).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});

describe("migrateLorebookCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges duplicate SE categories into the first one", async () => {
    const book = installLorebook(
      [
        { id: "cat-a", name: "SE: Characters" },
        { id: "cat-b", name: "SE: Characters" },
        { id: "cat-c", name: "SE: Characters" },
      ],
      [
        { id: "e1", category: "cat-a" },
        { id: "e2", category: "cat-b" },
        { id: "e3", category: "cat-c" },
      ],
    );

    await migrateLorebookCategories();

    expect(book.categories).toHaveLength(1);
    expect(book.categories[0].id).toBe("cat-a");
    expect(book.entries.map((e) => e.category)).toEqual([
      "cat-a",
      "cat-a",
      "cat-a",
    ]);
  });

  it("leaves the user's own duplicate-named categories alone", async () => {
    const book = installLorebook([
      { id: "mine-1", name: "Characters" },
      { id: "mine-2", name: "Characters" },
    ]);

    await migrateLorebookCategories();

    expect(book.categories).toHaveLength(2);
    expect(api.v1.lorebook.removeCategory).not.toHaveBeenCalled();
  });

  it("merges duplicates created by the legacy rename", async () => {
    const book = installLorebook(
      [
        { id: "legacy", name: "SE: Dramatis Personae" },
        { id: "current", name: "SE: Characters" },
      ],
      [{ id: "e1", category: "legacy" }],
    );

    await migrateLorebookCategories();

    expect(book.categories).toHaveLength(1);
    expect(book.categories[0].id).toBe("legacy");
    expect(book.categories[0].name).toBe("SE: Characters");
    expect(book.entries[0].category).toBe("legacy");
  });

  it("does nothing when every SE category is already unique", async () => {
    installLorebook([
      { id: "cat-a", name: "SE: Characters" },
      { id: "cat-b", name: "SE: Locations" },
    ]);

    await migrateLorebookCategories();

    expect(api.v1.lorebook.removeCategory).not.toHaveBeenCalled();
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });
});

describe("syncEratoCompatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the divider to a managed entity's entry when Erato is on", async () => {
    const book = installLorebook(
      [{ id: "cat", name: "SE: Characters" }],
      [{ id: "lb1", category: "cat", text: "Ada is a locksmith." }],
    );
    eratoMode(true);

    await syncEratoCompatibility(worldOf([{ lorebookEntryId: "lb1" }]));

    expect(book.entries[0].text).toBe("----\nAda is a locksmith.");
  });

  it("strips the divider again when Erato is off", async () => {
    const book = installLorebook(
      [{ id: "cat", name: "SE: Characters" }],
      [{ id: "lb1", category: "cat", text: "----\nAda is a locksmith." }],
    );
    eratoMode(false);

    await syncEratoCompatibility(worldOf([{ lorebookEntryId: "lb1" }]));

    expect(book.entries[0].text).toBe("Ada is a locksmith.");
  });

  it("reaches a Thread's entry, not only an entity's", async () => {
    // Phase 6 gave Threads lorebook entries and extended this loop to cover
    // them. Nothing tested it, so a writer with Erato on could have had every
    // SE entry fixed except the Engine's own.
    const book = installLorebook(
      [{ id: "cat", name: "SE: Threads" }],
      [{ id: "lb-t", category: "cat", text: "The letter is still unopened." }],
    );
    eratoMode(true);

    await syncEratoCompatibility(worldOf([], [{ lorebookEntryId: "lb-t" }]));

    expect(book.entries[0].text).toBe("----\nThe letter is still unopened.");
  });

  it("leaves an unmanaged entry alone", async () => {
    // The writer's own document. Nothing in Story Engine's records names it,
    // so nothing here may touch it.
    const book = installLorebook(
      [{ id: "cat", name: "Mine" }],
      [{ id: "theirs", category: "cat", text: "A note of my own." }],
    );
    eratoMode(true);

    await syncEratoCompatibility(worldOf([], []));

    expect(book.entries[0].text).toBe("A note of my own.");
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("writes nothing when the entry already reads the desired way", async () => {
    // Every write bumps the story's modifiedAt, and this runs on load — so an
    // unconditional rewrite would mark the story dirty every time it opened.
    installLorebook(
      [
        {
          id: "cat",
          name: "SE: Characters",
          settings: { entryHeader: "----" },
        },
      ],
      [{ id: "lb1", category: "cat", text: "Ada is a locksmith." }],
    );
    eratoMode(false);

    await syncEratoCompatibility(worldOf([{ lorebookEntryId: "lb1" }]));

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.updateCategory).not.toHaveBeenCalled();
  });

  it("sets the category header to match the mode", async () => {
    const book = installLorebook(
      [
        {
          id: "cat",
          name: "SE: Characters",
          settings: { entryHeader: "----" },
        },
      ],
      [{ id: "lb1", category: "cat", text: "Ada is a locksmith." }],
    );
    eratoMode(true);

    await syncEratoCompatibility(worldOf([{ lorebookEntryId: "lb1" }]));

    expect(book.categories[0].settings?.entryHeader).toBe("");
  });

  it("skips an entry whose id names nothing", async () => {
    // A stale lorebookEntryId — the writer deleted the entry. Reading it back
    // gives null, and this must not throw on the way past.
    installLorebook([], []);
    eratoMode(true);

    await expect(
      syncEratoCompatibility(worldOf([{ lorebookEntryId: "gone" }])),
    ).resolves.toBeUndefined();
  });
});
