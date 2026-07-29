import { describe, it, expect } from "vitest";
import {
  unmanagedEntries,
  groupAndSortEntries,
  resolveImportCategory,
} from "../../src/ui/panels/import/import-data";
import type { LorebookEntry } from "../../src/ui/panels/import/import-data";
import { detectCategory } from "../../src/core/utils/category-detect";
import { FieldID } from "../../src/config/field-definitions";

const e = (id: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id,
  displayName: id,
  ...over,
});

describe("unmanagedEntries", () => {
  it("drops entries whose id is in the managed set, keeps the rest", () => {
    const entries = [e("a"), e("b"), e("c")];
    const managed = new Set(["b"]);
    expect(unmanagedEntries(entries, managed).map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns all when nothing is managed", () => {
    const entries = [e("a"), e("b")];
    expect(unmanagedEntries(entries, new Set()).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("groupAndSortEntries", () => {
  it("groups by category, names alphabetical, uncategorized last", () => {
    const entries = [
      e("1", { category: "cat-z" }),
      e("2", { category: "cat-a" }),
      e("3", {}), // no category → uncategorized
      e("4", { category: "cat-a" }),
    ];
    const names = new Map([
      ["cat-z", "Zeta"],
      ["cat-a", "Alpha"],
    ]);
    const groups = groupAndSortEntries(entries, names);
    expect(groups.map((g) => g.label)).toEqual([
      "Alpha",
      "Zeta",
      "Uncategorized",
    ]);
    expect(groups[0].entries.map((x) => x.id)).toEqual(["2", "4"]);
    expect(groups[2].entries.map((x) => x.id)).toEqual(["3"]);
  });

  it("falls back to the category key when no display name is known", () => {
    const groups = groupAndSortEntries(
      [e("1", { category: "raw-key" })],
      new Map(),
    );
    expect(groups[0].label).toBe("raw-key");
  });
});

describe("resolveImportCategory", () => {
  it("uses a per-entry override when present, ignoring the text", () => {
    const entry = e("1", {
      text: "some prose that would auto-detect otherwise",
    });
    expect(resolveImportCategory(entry, { "1": FieldID.Locations })).toBe(
      FieldID.Locations,
    );
  });

  it("auto-detects from text when no override exists", () => {
    const entry = e("1", { text: "a nameless stretch of ruined coastline" });
    expect(resolveImportCategory(entry, {})).toBe(detectCategory(entry.text!));
  });

  it("only applies the override to the matching entry id", () => {
    const entry = e("2", { text: "unrelated" });
    expect(resolveImportCategory(entry, { "1": FieldID.Factions })).toBe(
      detectCategory("unrelated"),
    );
  });
});
