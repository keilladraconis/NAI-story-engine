import { describe, it, expect } from "vitest";
import {
  selectWorldBody,
  entityRequestIds,
  entityPending,
  entityBorderKind,
  isRequestActive,
} from "../../src/ui/panels/world/world-select";
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

  it("keeps an empty group (rendered so it stays editable/deletable)", () => {
    const { groups } = selectWorldBody({}, [group("g", [])]);
    expect(groups.map((g) => g.id)).toEqual(["g"]);
  });

  it("keeps a group whose only members are forge drafts (its own list hides them)", () => {
    const entitiesById = {
      d: ent("d", { lifecycle: "draft", sourceChatId: "c" }),
    };
    expect(
      selectWorldBody(entitiesById, [group("g", ["d"])]).groups.map(
        (g) => g.id,
      ),
    ).toEqual(["g"]);
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
  it("draft → draft (regardless of pending/complete)", () => {
    expect(entityBorderKind(ent("a", { lifecycle: "draft" }), true, true)).toBe(
      "draft",
    );
  });
  it("live + pending → pending (pending wins over complete)", () => {
    expect(entityBorderKind(ent("a"), true, true)).toBe("pending");
  });
  it("live + not pending + complete → complete", () => {
    expect(entityBorderKind(ent("a"), false, true)).toBe("complete");
  });
  it("live + not pending + not complete → incomplete", () => {
    expect(entityBorderKind(ent("a"), false, false)).toBe("incomplete");
  });
  it("complete defaults to false (2-arg call) → incomplete", () => {
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

describe("isRequestActive", () => {
  const rt = (over: Partial<RootState["runtime"]>): RootState["runtime"] =>
    ({
      activeRequest: null,
      queue: [],
      sega: { activeRequestIds: [] },
      ...over,
    }) as unknown as RootState["runtime"];

  it("true when the id is the active request / queued / SEGA-active", () => {
    expect(
      isRequestActive(rt({ activeRequest: { id: "req-1" } as never }), "req-1"),
    ).toBe(true);
    expect(
      isRequestActive(rt({ queue: [{ id: "req-1" } as never] }), "req-1"),
    ).toBe(true);
    expect(
      isRequestActive(
        rt({ sega: { activeRequestIds: ["req-1"] } as never }),
        "req-1",
      ),
    ).toBe(true);
  });

  it("false when the id matches nothing", () => {
    expect(
      isRequestActive(rt({ queue: [{ id: "other" } as never] }), "req-1"),
    ).toBe(false);
  });
});
