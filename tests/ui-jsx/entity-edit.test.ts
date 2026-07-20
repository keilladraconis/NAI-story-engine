import { describe, it, expect } from "vitest";
import {
  parseKeys,
  applyEratoPrefix,
  propagateNameInSummaries,
} from "../../src/ui-jsx/panels/world/entity-edit";
import type { WorldEntity } from "../../src/core/store";

const ent = (id: string, over: Partial<WorldEntity> = {}): WorldEntity => ({
  id,
  categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
  name: id,
  summary: "",
  lifecycle: "live",
  ...over,
});

describe("parseKeys", () => {
  it("splits, trims, drops empties", () => {
    expect(parseKeys("a, b ,,c ")).toEqual(["a", "b", "c"]);
    expect(parseKeys("")).toEqual([]);
    expect(parseKeys("   ")).toEqual([]);
  });
});

describe("applyEratoPrefix", () => {
  it("prefixes non-empty content when erato and not already prefixed", () => {
    expect(applyEratoPrefix("hello", true)).toBe("----\nhello");
  });
  it("leaves already-prefixed content unchanged", () => {
    expect(applyEratoPrefix("----\nhello", true)).toBe("----\nhello");
  });
  it("no-ops when erato is false or content empty", () => {
    expect(applyEratoPrefix("hello", false)).toBe("hello");
    expect(applyEratoPrefix("", true)).toBe("");
  });
});

describe("propagateNameInSummaries", () => {
  it("renames old→new (case-insensitive) in other entities, excludes the edited one, returns only changed", () => {
    const entities = [
      ent("a", { name: "John", summary: "John and jane" }),
      ent("b", { summary: "JOHN went home" }),
      ent("c", { summary: "nothing here" }),
    ];
    const updates = propagateNameInSummaries(entities, "a", "John", "Jack");
    expect(updates).toEqual([{ entityId: "b", summary: "Jack went home" }]);
  });
  it("regex-escapes special chars in the old name", () => {
    const entities = [ent("x", { summary: "the (Guild) rose" })];
    const updates = propagateNameInSummaries(entities, "z", "(Guild)", "Order");
    expect(updates).toEqual([{ entityId: "x", summary: "the Order rose" }]);
  });
  it("returns empty when nothing matches", () => {
    const entities = [ent("x", { summary: "unrelated" })];
    expect(propagateNameInSummaries(entities, "z", "Foo", "Bar")).toEqual([]);
  });
});
