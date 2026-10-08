import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bindEntryFor,
  renameEntry,
} from "../../../../src/core/store/effects/entity-entry";
import { FieldID } from "../../../../src/config/field-definitions";
import { nameKey } from "../../../../src/core/store/effects/handlers/lorebook";

describe("bindEntryFor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const NONE: ReadonlySet<string> = new Set();
  const hesper = {
    name: "Hesper Vane",
    categoryId: FieldID.DramatisPersonae,
  } as const;

  it("creates an empty, enabled entry keyed on the name", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([]);
    const create = vi
      .spyOn(api.v1.lorebook, "createEntry")
      .mockResolvedValue("e-new");
    const bound = await bindEntryFor(hesper, NONE);
    expect(bound).toEqual({ entryId: "e-new", created: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Hesper Vane",
        text: "",
        keys: [nameKey("Hesper Vane")],
        enabled: true,
      }),
    );
  });

  it("adopts an uncategorised entry of the same name and gives it a category", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-old", displayName: "hesper vane" },
    ]);
    vi.spyOn(api.v1.lorebook, "categories").mockResolvedValue([]);
    vi.spyOn(api.v1.lorebook, "createCategory").mockResolvedValue("se-cat");
    const create = vi.spyOn(api.v1.lorebook, "createEntry");
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    const bound = await bindEntryFor(hesper, NONE);
    expect(bound).toEqual({ entryId: "e-old", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("e-old", { category: "se-cat" });
  });

  it("adopts a categorised entry nothing binds and leaves its category alone", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-old", displayName: "Hesper Vane", category: "the-writers-own" },
    ]);
    const create = vi.spyOn(api.v1.lorebook, "createEntry");
    const update = vi.spyOn(api.v1.lorebook, "updateEntry");
    const bound = await bindEntryFor(hesper, NONE);
    expect(bound).toEqual({ entryId: "e-old", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("makes a new entry when the only match is already bound", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-taken", displayName: "Hesper Vane" },
    ]);
    vi.spyOn(api.v1.lorebook, "createEntry").mockResolvedValue("e-new");
    const update = vi.spyOn(api.v1.lorebook, "updateEntry");
    const bound = await bindEntryFor(hesper, new Set(["e-taken"]));
    expect(bound).toEqual({ entryId: "e-new", created: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("renameEntry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renames the entry and swaps a name-stub key", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: [nameKey("Kei")],
    });
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    await renameEntry("e1", "Kei", "Kay");
    expect(update).toHaveBeenCalledWith("e1", {
      displayName: "Kay",
      keys: [nameKey("Kay")],
    });
  });

  it("leaves keys the writer or a generation set", async () => {
    vi.spyOn(api.v1.lorebook, "entry").mockResolvedValue({
      id: "e1",
      displayName: "Kei",
      keys: ["kei", "the red fox"],
    });
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    await renameEntry("e1", "Kei", "Kay");
    expect(update).toHaveBeenCalledWith("e1", { displayName: "Kay" });
  });
});
