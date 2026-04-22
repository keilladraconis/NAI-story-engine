import { describe, it, expect } from "vitest";
import {
  detectCategory,
  cycleDulfsCategory,
  DULFS_CATEGORY_LABELS,
  DULFS_CATEGORY_CYCLE,
} from "../../../src/core/utils/category-detect";
import { FieldID } from "../../../src/config/field-definitions";

describe("detectCategory", () => {
  it("detects character from Type: line", () => {
    expect(detectCategory("Name: Elara\nType: Character\nA knight.")).toBe(
      FieldID.DramatisPersonae,
    );
  });

  it("is case-insensitive", () => {
    expect(detectCategory("Type: character")).toBe(FieldID.DramatisPersonae);
    expect(detectCategory("TYPE: LOCATION")).toBe(FieldID.Locations);
    expect(detectCategory("type: faction")).toBe(FieldID.Factions);
  });

  it("detects each known category", () => {
    expect(detectCategory("Type: System")).toBe(FieldID.UniverseSystems);
    expect(detectCategory("Type: Location")).toBe(FieldID.Locations);
    expect(detectCategory("Type: Faction")).toBe(FieldID.Factions);
    expect(detectCategory("Type: Dynamic")).toBe(FieldID.SituationalDynamics);
    expect(detectCategory("Type: Topic")).toBe(FieldID.Topics);
  });

  it("falls back to Topics for unknown types", () => {
    expect(detectCategory("Type: Spaceship")).toBe(FieldID.Topics);
    expect(detectCategory("No type line here")).toBe(FieldID.Topics);
    expect(detectCategory("")).toBe(FieldID.Topics);
  });
});

describe("cycleDulfsCategory", () => {
  it("advances to the next category in the cycle", () => {
    const first = DULFS_CATEGORY_CYCLE[0];
    const second = DULFS_CATEGORY_CYCLE[1];
    expect(cycleDulfsCategory(first)).toBe(second);
  });

  it("wraps around from last to first", () => {
    const last = DULFS_CATEGORY_CYCLE[DULFS_CATEGORY_CYCLE.length - 1];
    const first = DULFS_CATEGORY_CYCLE[0];
    expect(cycleDulfsCategory(last)).toBe(first);
  });

  it("covers all categories in one full cycle", () => {
    const visited = new Set<string>();
    let current = DULFS_CATEGORY_CYCLE[0];
    for (let i = 0; i < DULFS_CATEGORY_CYCLE.length; i++) {
      visited.add(current);
      current = cycleDulfsCategory(current);
    }
    expect(visited.size).toBe(DULFS_CATEGORY_CYCLE.length);
  });
});

describe("DULFS_CATEGORY_LABELS", () => {
  it("has a label for every category in the cycle", () => {
    for (const cat of DULFS_CATEGORY_CYCLE) {
      expect(DULFS_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});
