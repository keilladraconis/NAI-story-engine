import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { installHistoryFake, type HistoryFake } from "../helpers/history-fake";
import { registerHistorySyncEffects } from "../../src/core/store/effects/history-sync";
import {
  registerAutosaveEffects,
  type AutosaveHandle,
} from "../../src/core/store/effects/autosave";
import {
  loadBranchState,
  saveRecords,
} from "../../src/core/store/persistence/history-store";
import { toRecords } from "../../src/core/store/persistence/keyspace";
import { initialStoryState } from "../../src/core/store/slices/story";
import { initialWorldState } from "../../src/core/store/slices/world";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import { initialUIState } from "../../src/core/store/slices/ui";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialForgeState } from "../../src/core/store/slices/forge";
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
    // Not read by toRecords, but autosave's flush reads state.chat and the
    // flush test drives the real effect.
    chat: { chats: [], activeChatId: null },
    ui: initialUIState,
    runtime: initialRuntimeState,
    forge: initialForgeState,
  };
}

/** Most tests are not about autosave and want navigation to do nothing else. */
const NO_AUTOSAVE: AutosaveHandle = { flush: async () => {} };

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
    }, NO_AUTOSAVE);
    const calls = vi
      .mocked(api.v1.hooks.register)
      .mock.calls.filter((c) => c[0] === "onHistoryNavigated");
    expect(calls).toHaveLength(1);
  });

  it("bumps the history epoch on navigation", async () => {
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    }, NO_AUTOSAVE);
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
    }, NO_AUTOSAVE);

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
    }, NO_AUTOSAVE);

    h.goto(root);
    await registeredHook()({ nodeId: root });

    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: { world: { entityIds: string[] } } } | undefined;
    expect(loaded?.payload.world.entityIds).toEqual([]);
  });

  it("does not touch chat — it follows the writer, not the branch", async () => {
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    }, NO_AUTOSAVE);
    await registeredHook()({ nodeId: h.current() });
    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: Record<string, unknown> } | undefined;
    expect(loaded?.payload).not.toHaveProperty("chat");
  });
});

/** Drives the real autosave effect with a state the test can swap out, the way
 *  a rehydrate swaps it out underneath a debounce that is still in flight. */
function autosaveHarness(getState: () => RootState) {
  const handlers: Array<{
    match: (a: Action) => boolean;
    run: (a: Action) => void;
  }> = [];
  const subscribeEffect = ((match: never, run: never) => {
    handlers.push({ match, run });
    return () => {};
  }) as never;
  const autosave = registerAutosaveEffects(subscribeEffect, getState);
  return {
    autosave,
    fire(type: string) {
      const action = { type } as Action;
      for (const h of handlers) if (h.match(action)) h.run(action);
    },
  };
}

describe("history-sync × autosave", () => {
  let h: HistoryFake;
  let dispatched: Action[];

  beforeEach(() => {
    h = installHistoryFake();
    dispatched = [];
    vi.mocked(api.v1.hooks.register).mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes the pending write to the node it describes before rehydrating", async () => {
    // The writer forges an entity, then hits Ctrl+Z inside autosave's 2s
    // debounce. Without a flush, the timer wakes up holding post-navigation
    // state and writes it onto the node it was armed for — erasing the entity
    // from the branch it was actually created on. Redo does not bring it back.
    const root = h.current();
    const n1 = h.push();

    let state = stateWith(["b"]);
    const { autosave, fire } = autosaveHarness(() => state);
    fire("world/entityForged"); // arms pendingNode = n1

    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    }, autosave);

    h.goto(root);
    await registeredHook()({ nodeId: root });

    // The rehydrate has replaced the store — root has no world at all.
    state = stateWith([]);
    await vi.runAllTimersAsync();

    // Redo back to n1: the entity must still be there.
    h.goto(n1);
    expect((await loadBranchState(n1)).world.entityIds).toEqual(["b"]);
  });
});

describe("history-sync — concurrent navigation", () => {
  let h: HistoryFake;
  let dispatched: Action[];

  beforeEach(() => {
    h = installHistoryFake();
    dispatched = [];
    vi.mocked(api.v1.hooks.register).mockClear();
  });

  it("ignores a read that a later navigation has superseded", async () => {
    // loadBranchState fans out over the target node's index, so a rich node
    // issues far more gets than an empty one. Holding Ctrl+Z through a rich
    // node lets its read resolve after the read for where the writer landed.
    const root = h.current();
    await saveRecords(toRecords(stateWith(["root-only"])), root);
    const rich = h.push();
    await saveRecords(toRecords(stateWith(["a", "b", "c"])), rich);

    // Both nodes stay reachable from the cursor; only `rich` reads slowly.
    const realGet = api.v1.historyStorage.get;
    api.v1.historyStorage.get = (async (key: string, node?: number) => {
      if (node === rich) await new Promise((r) => setTimeout(r, 20));
      return realGet(key, node);
    }) as typeof api.v1.historyStorage.get;

    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    }, NO_AUTOSAVE);

    const hook = registeredHook();
    await Promise.all([hook({ nodeId: rich }), hook({ nodeId: root })]);

    const loads = dispatched.filter(
      (a) => a.type === "persist/loaded",
    ) as Array<{ payload: { world: { entityIds: string[] } } }>;
    // The writer navigated to root last, so root's World is what they must see.
    expect(loads.at(-1)?.payload.world.entityIds).toEqual(["root-only"]);
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

  it("is wired into registerEffects", () => {
    // The guard above only proves the registration exists in a module. Nothing
    // imports history-sync for its side effects, so deleting the call below is
    // a silent, all-tests-green way to turn branch-scoped rehydrate off — and
    // the historyEpoch bump the Setup tab depends on with it.
    const wiring = readFileSync(
      join(SRC, "core/store/register-effects.ts"),
      "utf8",
    );
    expect(wiring).toContain("registerHistorySyncEffects(");
  });
});
