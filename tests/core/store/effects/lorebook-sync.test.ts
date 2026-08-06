import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ensureCategory,
  migrateLorebookCategories,
} from "../../../../src/core/store/effects/lorebook-sync";
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
  return { categories, entries };
}

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
