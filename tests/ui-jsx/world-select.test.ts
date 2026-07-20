import { describe, it, expect } from "vitest";
import {
  selectWorldBody,
  entityRequestIds,
  entityPending,
  entityBorderKind,
} from "../../src/ui-jsx/panels/world/world-select";
import type { WorldEntity, WorldGroup, RootState } from "../../src/core/store";

const ent = (id: string, over: Partial<WorldEntity> = {}): WorldEntity => ({
  id,
  categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
  name: id,
  summary: "",
  lifecycle: "live",
  ...over,
});

const group = (id: string, entityIds: string[]): WorldGroup => ({
  id,
  title: id,
  summary: "",
  entityIds,
});

describe("selectWorldBody", () => {
  it("loose = live + manual-draft, ungrouped; forge drafts hidden", () => {
    const entitiesById = {
      a: ent("a"),
      b: ent("b", { lifecycle: "draft" }), // manual draft (no sourceChatId) → visible
      c: ent("c", { lifecycle: "draft", sourceChatId: "chat1" }), // forge draft → hidden
    };
    const { groups, loose } = selectWorldBody(entitiesById, []);
    expect(groups).toEqual([]);
    expect(loose.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("grouped entities are excluded from loose", () => {
    const entitiesById = { a: ent("a"), b: ent("b") };
    const { groups, loose } = selectWorldBody(entitiesById, [
      group("g1", ["a"]),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["g1"]);
    expect(loose.map((e) => e.id)).toEqual(["b"]);
  });

  it("hides a group whose only members are forge drafts", () => {
    const entitiesById = {
      d: ent("d", { lifecycle: "draft", sourceChatId: "c" }),
    };
    expect(selectWorldBody(entitiesById, [group("g", ["d"])]).groups).toEqual(
      [],
    );
  });
});

describe("entityPending", () => {
  const rt = (over: Partial<RootState["runtime"]>): RootState["runtime"] =>
    ({
      activeRequest: null,
      queue: [],
      sega: { activeRequestIds: [] },
      ...over,
    }) as unknown as RootState["runtime"];

  it("true when active/queued/sega id matches; false otherwise", () => {
    expect(
      entityPending(
        rt({ activeRequest: { id: "lb-entity-x-content" } as never }),
        "x",
      ),
    ).toBe(true);
    expect(
      entityPending(
        rt({ queue: [{ id: "se-entity-summary-x" } as never] }),
        "x",
      ),
    ).toBe(true);
    expect(
      entityPending(
        rt({ sega: { activeRequestIds: ["lb-entity-x-keys"] } as never }),
        "x",
      ),
    ).toBe(true);
    expect(entityPending(rt({ queue: [{ id: "other" } as never] }), "x")).toBe(
      false,
    );
    expect(
      entityPending(
        rt({ activeRequest: { id: "lb-entity-x-content" } as never }),
        "y",
      ),
    ).toBe(false);
  });
});

describe("entityBorderKind", () => {
  it("draft → draft (even if pending); live+pending → pending; live+idle → incomplete", () => {
    expect(entityBorderKind(ent("a", { lifecycle: "draft" }), true)).toBe(
      "draft",
    );
    expect(entityBorderKind(ent("a"), true)).toBe("pending");
    expect(entityBorderKind(ent("a"), false)).toBe("incomplete");
  });
});

describe("entityRequestIds", () => {
  it("lists the four entity request ids", () => {
    expect(entityRequestIds("x")).toEqual([
      "se-entity-summary-x",
      "entity-summary-bind-x",
      "lb-entity-x-content",
      "lb-entity-x-keys",
    ]);
  });
});
