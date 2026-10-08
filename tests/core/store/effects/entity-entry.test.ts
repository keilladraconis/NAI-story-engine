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

  it("creates an empty, enabled entry keyed on the name", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([]);
    const create = vi
      .spyOn(api.v1.lorebook, "createEntry")
      .mockResolvedValue("e-new");
    const bound = await bindEntryFor({
      name: "Hesper Vane",
      categoryId: FieldID.DramatisPersonae,
    });
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

  it("binds an unmanaged entry of the same name instead of making a second", async () => {
    vi.spyOn(api.v1.lorebook, "entries").mockResolvedValue([
      { id: "e-old", displayName: "hesper vane" },
    ]);
    const create = vi.spyOn(api.v1.lorebook, "createEntry");
    const update = vi
      .spyOn(api.v1.lorebook, "updateEntry")
      .mockResolvedValue(undefined);
    const bound = await bindEntryFor({
      name: "Hesper Vane",
      categoryId: FieldID.DramatisPersonae,
    });
    expect(bound).toEqual({ entryId: "e-old", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("e-old", expect.any(Object));
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
