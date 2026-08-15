import { describe, it, expect, beforeEach, vi } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";
import { registerHistorySyncEffects } from "../../src/core/store/effects/history-sync";
import { saveRecords } from "../../src/core/store/persistence/history-store";
import { toRecords } from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState, WorldEntity } from "../../src/core/store/types";
import type { Action } from "nai-store";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function stateWith(ids: string[]): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const id of ids) {
    entitiesById[id] = {
      id,
      categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
      lifecycle: "live",
      name: id,
      summary: "",
    };
  }
  return {
    story: initialStoryState,
    world: { ...initialWorldState, entitiesById, entityIds: ids },
    foundation: initialFoundationState,
  } as RootState;
}

/** Grab the single onHistoryNavigated callback the effect registered. */
function registeredHook(): (params: { nodeId: number }) => Promise<void> {
  const calls = vi.mocked(api.v1.hooks.register).mock.calls;
  const entry = calls.filter((c) => c[0] === "onHistoryNavigated").pop();
  return entry?.[1] as (params: { nodeId: number }) => Promise<void>;
}

describe("history-sync", () => {
  let h: HistoryFake;
  let dispatched: Action[];

  beforeEach(() => {
    h = installHistoryFake();
    dispatched = [];
    vi.mocked(api.v1.hooks.register).mockClear();
  });

  it("registers exactly one onHistoryNavigated callback", () => {
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    });
    const calls = vi
      .mocked(api.v1.hooks.register)
      .mock.calls.filter((c) => c[0] === "onHistoryNavigated");
    expect(calls).toHaveLength(1);
  });

  it("bumps the history epoch on navigation", async () => {
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    });
    await registeredHook()({ nodeId: h.current() });
    expect(dispatched.map((a) => a.type)).toContain(
      "runtime/documentHistoryNavigated",
    );
  });

  it("replaces World state with the branch it navigated to", async () => {
    const root = h.current();
    await saveRecords(toRecords(stateWith(["a"])), root);
    const child = h.push();
    await saveRecords(toRecords(stateWith(["a", "b"])), child);

    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    });

    h.goto(root);
    await registeredHook()({ nodeId: root });

    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: { world: { entityIds: string[] } } } | undefined;
    expect(loaded?.payload.world.entityIds).toEqual(["a"]);
  });

  it("clears the World entirely when navigating to a node with no index", async () => {
    const root = h.current();
    h.push();
    await saveRecords(toRecords(stateWith(["a"])), h.current());

    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    });

    h.goto(root);
    await registeredHook()({ nodeId: root });

    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: { world: { entityIds: string[] } } } | undefined;
    expect(loaded?.payload.world.entityIds).toEqual([]);
  });

  it("does not touch chat — it follows the writer, not the branch", async () => {
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    });
    await registeredHook()({ nodeId: h.current() });
    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: Record<string, unknown> } | undefined;
    expect(loaded?.payload).not.toHaveProperty("chat");
  });
});

describe("onHistoryNavigated has exactly one home", () => {
  const SRC = join(__dirname, "../../src");

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("is registered in history-sync.ts and nowhere else", () => {
    // api.v1.hooks.register holds one callback per hook name — a second
    // registration silently replaces the first.
    const offenders = files(SRC).filter(
      (f) =>
        readFileSync(f, "utf8").includes('register("onHistoryNavigated"') &&
        !f.endsWith("history-sync.ts"),
    );
    expect(offenders).toEqual([]);
  });
});
