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
import { initialEngineState } from "../../src/core/store/slices/engine";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../src/core/store/types";
import { SE_THREAD_CATEGORY } from "../../src/core/engine/thread-bind";
import {
  fingerprintEntryText,
  lorebookRecordKey,
} from "../../src/core/engine/lorebook-write";
import { lorebookOriginalKey } from "../../src/core/keys";
import {
  installLorebookFake,
  type LorebookFake,
} from "../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../helpers/story-storage-fake";
import { createStore, type Action, type Store } from "nai-store";
import { rootReducer } from "../../src/core/store";
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
    engine: initialEngineState,
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

  it("does not touch the Foundation — undo does not rewrite the premise", async () => {
    // Foundation is story-scoped: Shape, Intent and Contract describe the whole
    // story, and ATTG/Style mirror into Memory and Author's Note, which undo
    // does not move either. Rehydrating it here would revert what the writer
    // sees while Memory kept the newer text the model actually reads.
    registerHistorySyncEffects((a: Action) => {
      dispatched.push(a);
    }, NO_AUTOSAVE);
    await registeredHook()({ nodeId: h.current() });
    const loaded = dispatched.find((a) => a.type === "persist/loaded") as
      { payload: Record<string, unknown> } | undefined;
    expect(loaded?.payload).not.toHaveProperty("foundation");
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

describe("history-sync — §7 reconciliation", () => {
  let h: HistoryFake;
  let lorebook: LorebookFake;
  let story: StoryStorageFake;
  let dispatched: Action[];
  /** A real store as well as the action log: `touched` has to land in the
   *  slice, not merely be dispatched at it. */
  let store: Store<RootState>;

  /** A world carrying threads, as loadBranchState will hand it back. */
  function stateWithThreads(threads: Thread[]): RootState {
    return {
      ...stateWith([]),
      world: { ...initialWorldState, threads },
    };
  }

  function thread(over: Partial<Thread> = {}): Thread {
    return {
      id: "t1",
      title: "The hidden letter",
      text: "Ada has not told Brennan.",
      horizon: "plot",
      entityIds: [],
      status: "open",
      anchorParagraph: null,
      ...over,
    };
  }

  function record(a: Action): void {
    dispatched.push(a);
    store.dispatch(a);
  }

  async function navigate(node: number): Promise<void> {
    registerHistorySyncEffects(record, NO_AUTOSAVE);
    h.goto(node);
    await registeredHook()({ nodeId: node });
  }

  /** The `SE: Threads` category, as a story the Engine has run in holds it. */
  async function threadCategory(): Promise<string> {
    return api.v1.lorebook.createCategory({
      id: "cat-threads",
      name: SE_THREAD_CATEGORY,
    });
  }

  beforeEach(() => {
    h = installHistoryFake();
    lorebook = installLorebookFake();
    story = installStoryStorageFake();
    dispatched = [];
    store = createStore<RootState>(rootReducer);
    vi.mocked(api.v1.hooks.register).mockClear();
  });

  it("re-enables the entry of a thread the branch still holds open", async () => {
    // The undo §7 exists for. The pass retired the thread at the child node —
    // the `t:` record says satisfied and the lorebook entry is disabled — and
    // the writer undid past it. historyStorage reverted what the Engine
    // believes; the lorebook did not revert what it did.
    const root = h.current();
    await threadCategory();
    lorebook.seed({
      id: "lb-t1",
      displayName: "The hidden letter",
      category: "cat-threads",
      enabled: false,
    });
    await saveRecords(
      toRecords(stateWithThreads([thread({ lorebookEntryId: "lb-t1" })])),
      root,
    );
    h.push();

    await navigate(root);

    expect(lorebook.read("lb-t1")?.enabled).toBe(true);
  });

  it("disables a thread entry no thread on this branch answers for", async () => {
    // Two shapes at once: a thread opened on a branch the writer navigated away
    // from, and §4.5's orphan — the entry a cap displacement left behind, which
    // no thread will ever name again. Both go on injecting a reminder for a
    // commitment this branch has never heard of.
    const root = h.current();
    await threadCategory();
    lorebook.seed({
      id: "lb-gone",
      displayName: "A commitment from another branch",
      category: "cat-threads",
      enabled: true,
    });
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(lorebook.read("lb-gone")?.enabled).toBe(false);
  });

  it("disables rather than deletes, and snapshots on the way through", async () => {
    // §5.2: the writer's lorebook is never destroyed, and the flip goes through
    // Task 1's door like every other Engine write — which is the first §5.2
    // snapshot a thread entry has ever had, creation having bypassed the door.
    const root = h.current();
    await threadCategory();
    lorebook.seed({
      id: "lb-gone",
      displayName: "Orphan",
      text: "Somebody promised something.",
      category: "cat-threads",
      enabled: true,
    });
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(lorebook.read("lb-gone")?.text).toBe("Somebody promised something.");
    expect(story.get(lorebookOriginalKey("lb-gone"))).toMatchObject({
      enabled: true,
    });
  });

  it("writes nothing when the branch and the lorebook already agree", async () => {
    const root = h.current();
    await threadCategory();
    lorebook.seed({
      id: "lb-t1",
      category: "cat-threads",
      enabled: true,
    });
    await saveRecords(
      toRecords(stateWithThreads([thread({ lorebookEntryId: "lb-t1" })])),
      root,
    );

    await navigate(root);

    expect(lorebook.updates()).toEqual([]);
  });

  it("leaves the writer's own lorebook alone", async () => {
    // Nothing outside the Engine's own category and the branch's own threads is
    // reconciled — including an entity entry the Engine revised, which §7 can
    // classify and cannot put back.
    const root = h.current();
    lorebook.seed({ id: "mine", text: "Ada is a locksmith.", enabled: true });
    await api.v1.historyStorage.set(
      lorebookRecordKey("mine"),
      {
        entryId: "mine",
        textFingerprint: fingerprintEntryText("something else"),
      },
      root,
    );
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(lorebook.updates()).toEqual([]);
    expect(lorebook.read("mine")?.enabled).toBe(true);
  });

  it("never creates the thread category in a lorebook that has none", async () => {
    // A writer who has never switched the Engine on must not find an `SE:
    // Threads` category in their lorebook because they pressed undo.
    const root = h.current();
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(lorebook.categories()).toEqual([]);
  });

  it("recounts touched from the records at the node", async () => {
    // §9.1's ∆, as a branch count rather than a session one. Two records, one
    // of them for an entry the writer has since deleted — which is no longer an
    // entry the Engine has rewritten.
    const root = h.current();
    lorebook.seed({ id: "a", text: "ours", enabled: true });
    for (const [id, text] of [
      ["a", "ours"],
      ["deleted", "gone"],
    ]) {
      await api.v1.historyStorage.set(
        lorebookRecordKey(id),
        { entryId: id, textFingerprint: fingerprintEntryText(text) },
        root,
      );
    }
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(store.getState().engine.touched).toBe(1);
  });

  it("counts an entry the writer edited after we wrote it", async () => {
    // `theirs` still counts: the writer editing our revision afterwards does
    // not un-revise it, and §9.1's slot is an activity level.
    const root = h.current();
    lorebook.seed({ id: "a", text: "they rewrote this", enabled: true });
    await api.v1.historyStorage.set(
      lorebookRecordKey("a"),
      { entryId: "a", textFingerprint: fingerprintEntryText("what we wrote") },
      root,
    );
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(store.getState().engine.touched).toBe(1);
  });

  it("does not flip flags for a navigation a later one has superseded", async () => {
    // A held Ctrl+Z fires the hook per node it passes through, and the check
    // before the rehydrate is not enough on its own: reconciliation reads the
    // lorebook, which is three awaits during which the writer keeps pressing.
    // A navigation overtaken inside that window would write the flags its own
    // node implies over the ones the writer actually landed on.
    const root = h.current();
    await threadCategory();
    lorebook.seed({ id: "lb-t1", category: "cat-threads", enabled: true });
    await saveRecords(
      toRecords(
        stateWithThreads([
          thread({ lorebookEntryId: "lb-t1", status: "satisfied" }),
        ]),
      ),
      root,
    );
    const child = h.push();
    await saveRecords(
      toRecords(stateWithThreads([thread({ lorebookEntryId: "lb-t1" })])),
      child,
    );

    // Park the FIRST reconciliation inside its lorebook read, so the second
    // navigation starts while it is still in there.
    const realEntries = api.v1.lorebook.entries;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let parked = false;
    api.v1.lorebook.entries = (async () => {
      if (!parked) {
        parked = true;
        await gate;
      }
      return realEntries();
    }) as typeof api.v1.lorebook.entries;

    registerHistorySyncEffects(record, NO_AUTOSAVE);
    const hook = registeredHook();
    const overtaken = hook({ nodeId: root });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await hook({ nodeId: child });
    release();
    await overtaken;

    // The child says the thread is open and the entry already is, so the
    // navigation the writer landed on writes nothing. The one the Engine was
    // still inside would have disabled it.
    expect(lorebook.updates()).toEqual([]);
    expect(lorebook.read("lb-t1")?.enabled).toBe(true);
  });

  it("touches nothing in a lorebook with no SE: Threads category", async () => {
    // The unconditional-reconciliation bargain (§14.3) is that a story the
    // Engine never ran in costs two lorebook reads and nothing else. With no
    // `SE: Threads` category the id to match against is `""` — and if the
    // runtime hands back `category: ""` for an uncategorised entry rather than
    // omitting the field, every loose entry the writer owns is claimed as a
    // thread orphan, found nameless, and switched off. On the first Ctrl+Z of
    // someone who has never opened the Engine.
    //
    // Which of the two shapes the runtime uses is not established: this file's
    // own comment asserted `undefined` with no evidence, while `mount.ts` and
    // `forge-chat-effects.ts` both hedge with `!e.category`. Two surfaces
    // disagreeing about one runtime fact is the defect, so the category arm is
    // skipped entirely when there is no category — which costs a line and
    // removes the question.
    const root = h.current();
    lorebook.seed({ id: "lb-loose-1", displayName: "Ada", enabled: true });
    lorebook.seed({
      id: "lb-loose-2",
      displayName: "Brennan",
      category: "",
      enabled: true,
    } as LorebookEntry);
    await saveRecords(toRecords(stateWithThreads([])), root);

    await navigate(root);

    expect(lorebook.updates()).toEqual([]);
    expect(lorebook.read("lb-loose-1")?.enabled).toBe(true);
    expect(lorebook.read("lb-loose-2")?.enabled).toBe(true);
  });

  it("still answers for an entry the branch's own threads name, category or not", async () => {
    // Skipping the category arm must not become skipping reconciliation. A
    // thread's own `lorebookEntryId` is the other half of §7's union, and it
    // is what catches an entry the writer refiled into a category of their own.
    const root = h.current();
    lorebook.seed({
      id: "lb-t1",
      displayName: "The hidden letter",
      category: "cat-mine",
      enabled: false,
    });
    await saveRecords(
      toRecords(stateWithThreads([thread({ lorebookEntryId: "lb-t1" })])),
      root,
    );

    await navigate(root);

    expect(lorebook.read("lb-t1")?.enabled).toBe(true);
  });

  it("stops flipping flags the moment a later navigation supersedes it", async () => {
    // The check before the loop is not the whole guard. The loop awaits a
    // lorebook write per flip, so a held Ctrl+Z can overtake a reconciliation
    // that has already started writing — and every flip after that point
    // writes a node the writer has already left.
    const root = h.current();
    await threadCategory();
    lorebook.seed({ id: "lb-a", category: "cat-threads", enabled: true });
    lorebook.seed({ id: "lb-b", category: "cat-threads", enabled: true });
    await saveRecords(toRecords(stateWithThreads([])), root);
    const child = h.push();
    // The child still holds a thread for lb-b, so the navigation that overtakes
    // has nothing of its own to write and the assertion is about the stale one.
    await saveRecords(
      toRecords(
        stateWithThreads([thread({ id: "tb", lorebookEntryId: "lb-b" })]),
      ),
      child,
    );

    registerHistorySyncEffects(record, NO_AUTOSAVE);
    const hook = registeredHook();

    // Start the second navigation from inside the first flip's write.
    let overtaking: Promise<void> | undefined;
    const realUpdate = api.v1.lorebook.updateEntry;
    api.v1.lorebook.updateEntry = (async (
      id: string,
      patch: Partial<LorebookEntry>,
    ) => {
      overtaking ??= hook({ nodeId: child });
      return realUpdate(id, patch);
    }) as typeof api.v1.lorebook.updateEntry;

    await hook({ nodeId: root });
    await overtaking;

    // One flip landed before the overtake; the second belonged to a node the
    // writer had already left, and the branch they are on says lb-b is open.
    expect(lorebook.updates().map((u) => u.id)).toEqual(["lb-a"]);
    expect(lorebook.read("lb-b")?.enabled).toBe(true);
  });

  it("survives a lorebook that throws", async () => {
    // Fire-and-forget hook: a rejection has nowhere to land, and the rehydrate
    // that ran before it must not be undone by a failed reconciliation.
    const root = h.current();
    await threadCategory();
    lorebook.seed({ id: "lb-gone", category: "cat-threads", enabled: true });
    lorebook.failNextUpdate(new Error("lorebook is busy"));
    await saveRecords(toRecords(stateWithThreads([])), root);

    await expect(navigate(root)).resolves.toBeUndefined();
  });
});

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
