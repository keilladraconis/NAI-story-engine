import { describe, it, expect } from "vitest";
import {
  selectWorldBody,
  partitionThreads,
  entityRequestIds,
  entityPending,
  entityBorderKind,
  isRequestActive,
} from "../../src/ui/panels/world/world-select";
import type { WorldEntity, Thread, RootState } from "../../src/core/store";

const ent = (id: string, over: Partial<WorldEntity> = {}): WorldEntity => ({
  id,
  categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
  name: id,
  summary: "",
  lifecycle: "live",
  ...over,
});

const thread = (id: string, entityIds: string[]): Thread => ({
  id,
  title: id,
  text: "",
  horizon: "plot",
  entityIds,
  status: "open",
  anchorParagraph: null,
});

describe("selectWorldBody", () => {
  it("loose = live + manual-draft, unthreaded; forge drafts hidden", () => {
    const entitiesById = {
      a: ent("a"),
      b: ent("b", { lifecycle: "draft" }), // manual draft (no sourceChatId) → visible
      c: ent("c", { lifecycle: "draft", sourceChatId: "chat1" }), // forge draft → hidden
    };
    const { threads, loose } = selectWorldBody(entitiesById, []);
    expect(threads).toEqual([]);
    expect(loose.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("lists an entity in the World even when a thread casts it", () => {
    // Threads stopped being a GROUPING of the World and became a section beside
    // it. An entity hidden from the World because some thread happened to cast
    // it was findable only by expanding the right thread, and a thread's cast is
    // now a detector input rather than a place entities live.
    const entitiesById = { a: ent("a"), b: ent("b") };
    const { threads, loose } = selectWorldBody(entitiesById, [
      thread("g1", ["a"]),
    ]);
    expect(threads.map((g) => g.id)).toEqual(["g1"]);
    expect(loose.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps an empty thread (rendered so it stays editable/deletable)", () => {
    const { threads } = selectWorldBody({}, [thread("g", [])]);
    expect(threads.map((g) => g.id)).toEqual(["g"]);
  });

  it("keeps a thread whose only members are forge drafts (its own list hides them)", () => {
    const entitiesById = {
      d: ent("d", { lifecycle: "draft", sourceChatId: "c" }),
    };
    expect(
      selectWorldBody(entitiesById, [thread("g", ["d"])]).threads.map(
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

describe("partitionThreads", () => {
  // Threads accumulate, and a story that has resolved twenty commitments should
  // not show twenty rows. Open ones are the working set; satisfied and abandoned
  // are history, one click away rather than gone — reopening one means finding
  // it first.
  const withStatus = (id: string, status: Thread["status"]): Thread => ({
    ...thread(id, []),
    status,
  });

  it("puts open threads first and retires the rest", () => {
    const { open, retired } = partitionThreads([
      withStatus("a", "open"),
      withStatus("b", "satisfied"),
      withStatus("c", "abandoned"),
      withStatus("d", "open"),
    ]);
    expect(open.map((t) => t.id)).toEqual(["a", "d"]);
    expect(retired.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("counts abandoned as retired, not as a third list", () => {
    // Abandoned is a distinct READING — it says the story walked away rather
    // than resolved — but it behaves as satisfied does everywhere else, so it
    // belongs in the same fold.
    const { open, retired } = partitionThreads([withStatus("x", "abandoned")]);
    expect(open).toEqual([]);
    expect(retired.map((t) => t.id)).toEqual(["x"]);
  });

  it("preserves the stored order within each list", () => {
    // The World renders threads in creation order; partitioning must not sort.
    const { open } = partitionThreads([
      withStatus("z", "open"),
      withStatus("y", "satisfied"),
      withStatus("x", "open"),
    ]);
    expect(open.map((t) => t.id)).toEqual(["z", "x"]);
  });

  it("returns two empty lists for no threads", () => {
    expect(partitionThreads([])).toEqual({ open: [], retired: [] });
  });
});
