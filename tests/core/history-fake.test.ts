import { describe, it, expect, beforeEach } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";

describe("history fake", () => {
  let h: HistoryFake;
  beforeEach(() => {
    h = installHistoryFake();
  });

  it("reads back a value written at the current node", async () => {
    await api.v1.historyStorage.set("k", 1);
    expect(await api.v1.historyStorage.get("k")).toBe(1);
  });

  it("inherits a parent's value at a child", async () => {
    await api.v1.historyStorage.set("k", "parent");
    h.push();
    expect(await api.v1.historyStorage.get("k")).toBe("parent");
  });

  it("lets a child shadow the parent without touching it", async () => {
    await api.v1.historyStorage.set("k", "parent");
    const parent = h.current();
    h.push();
    await api.v1.historyStorage.set("k", "child");
    expect(await api.v1.historyStorage.get("k")).toBe("child");
    expect(await api.v1.historyStorage.get("k", parent)).toBe("parent");
  });

  it("hides a child's write after navigating back", async () => {
    const parent = h.current();
    h.push();
    await api.v1.historyStorage.set("only-here", true);
    h.goto(parent);
    expect(await api.v1.historyStorage.get("only-here")).toBeUndefined();
  });

  it("does not leak between sibling branches", async () => {
    const root = h.current();
    h.push();
    await api.v1.historyStorage.set("left", true);
    h.goto(root);
    h.push();
    expect(await api.v1.historyStorage.get("left")).toBeUndefined();
  });

  it("list() inherits ancestor keys like get()", async () => {
    await api.v1.historyStorage.set("a", 1);
    h.push();
    await api.v1.historyStorage.set("b", 2);
    expect((await api.v1.historyStorage.list()).sort()).toEqual(["a", "b"]);
  });

  it("hands out unordered ids — a child can be smaller than its parent", () => {
    const parent = h.current();
    const child = h.push();
    expect(child).toBeLessThan(parent);
  });

  it("getOrDefault falls back for a node off the current chain", async () => {
    // Same rule as get/has/list: a node that is not an ancestor of the cursor
    // is not addressable, so the fallback wins even though the value exists.
    const root = h.current();
    h.push();
    await api.v1.historyStorage.set("k", "on-the-branch");
    h.goto(root);
    expect(await api.v1.historyStorage.getOrDefault("k", "fallback")).toBe(
      "fallback",
    );
  });

  it("getOrDefault returns an inherited value when the node IS reachable", async () => {
    await api.v1.historyStorage.set("k", "from-parent");
    h.push();
    expect(await api.v1.historyStorage.getOrDefault("k", "fallback")).toBe(
      "from-parent",
    );
  });
});
