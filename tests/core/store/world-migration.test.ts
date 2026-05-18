import { describe, it, expect } from "vitest";
import { migrateWorldState } from "../../../src/core/store/index";
import type { WorldEntity, WorldState } from "../../../src/core/store/types";
import { FieldID } from "../../../src/config/field-definitions";

describe("migrateWorldState — lifecycle backfill", () => {
  it("backfills lifecycle='live' for entities with a lorebookEntryId", () => {
    const legacy = {
      entitiesById: {
        "e1": {
          id: "e1",
          categoryId: FieldID.DramatisPersonae,
          name: "Vesper",
          summary: "x",
          lorebookEntryId: "lb-1",
        } as unknown as WorldEntity,
      },
      entityIds: ["e1"],
      groups: [],
      forgeLoopActive: false,
    } as unknown as WorldState;

    const migrated = migrateWorldState(legacy);
    expect(migrated.entitiesById["e1"].lifecycle).toBe("live");
  });

  it("backfills lifecycle='draft' for entities without a lorebookEntryId", () => {
    const legacy = {
      entitiesById: {
        "e2": {
          id: "e2",
          categoryId: FieldID.DramatisPersonae,
          name: "Unsaved",
          summary: "y",
        } as unknown as WorldEntity,
      },
      entityIds: ["e2"],
      groups: [],
      forgeLoopActive: false,
    } as unknown as WorldState;

    const migrated = migrateWorldState(legacy);
    expect(migrated.entitiesById["e2"].lifecycle).toBe("draft");
  });

  it("preserves explicit lifecycle when already present", () => {
    const fresh = {
      entitiesById: {
        "e3": {
          id: "e3",
          categoryId: FieldID.Locations,
          name: "Quay",
          summary: "z",
          lifecycle: "draft" as const,
        },
      },
      entityIds: ["e3"],
      groups: [],
      forgeLoopActive: false,
    } as WorldState;

    const migrated = migrateWorldState(fresh);
    expect(migrated.entitiesById["e3"].lifecycle).toBe("draft");
  });

  it("backfills lifecycle on v11 entities[] format too", () => {
    const v11 = {
      entities: [
        {
          id: "e4",
          categoryId: FieldID.Factions,
          name: "Old Guild",
          summary: "q",
          lorebookEntryId: "lb-4",
        } as unknown as WorldEntity,
      ],
      groups: [],
    } as unknown as WorldState;

    const migrated = migrateWorldState(v11);
    expect(migrated.entitiesById["e4"].lifecycle).toBe("live");
    expect(migrated.entityIds).toEqual(["e4"]);
  });
});
