import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type { RootState, Thread } from "../../../src/core/store/types";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  drain,
  INTENT_MAX_TOKENS,
  type DrainDeps,
} from "../../../src/core/engine/execute";
import type { Intent } from "../../../src/core/engine/loop-machine";
import { TRIAGE_MAX_TOKENS } from "../../../src/core/engine/triage-strategy";
import { lorebookOriginalKey } from "../../../src/core/keys";
import { lorebookRecordKey } from "../../../src/core/engine/lorebook-write";
import {
  installHistoryFake,
  type HistoryFake,
} from "../../helpers/history-fake";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

// ─────────────────────────────── the harness ───────────────────────────────

const ENTRY = "thread-entry-1";

function thread(id: string, over: Partial<Thread> = {}): Thread {
  return {
    id,
    title: id,
    text: `The commitment called ${id}.`,
    horizon: "plot",
    entityIds: [],
    status: "open",
    ...over,
  };
}

let history: HistoryFake;
let lorebook: LorebookFake;
let story: StoryStorageFake;
let logged: string[];

type Harness = {
  store: Store<RootState>;
  deps: DrainDeps;
};

function harness(threads: Thread[] = []): Harness {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({ world: { ...initialWorldState, threads } }),
  );
  return {
    store,
    deps: {
      dispatch: store.dispatch,
      getState: store.getState,
      nodeId: history.current(),
      log: async (...messages: unknown[]) => {
        logged.push(messages.map(String).join(" "));
      },
    },
  };
}

function budget(tokens: number): void {
  vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(tokens);
}

beforeEach(() => {
  history = installHistoryFake();
  lorebook = installLorebookFake();
  story = installStoryStorageFake();
  logged = [];
  budget(2048);
});

// ───────────────────────────────── retire ─────────────────────────────────

describe("drain — retire", () => {
  it("disables the thread's lorebook entry and marks the thread satisfied", async () => {
    lorebook.seed({
      id: ENTRY,
      displayName: "The debt",
      text: "owed",
      enabled: true,
    });
    const h = harness([thread("t1", { lorebookEntryId: ENTRY })]);

    const outcome = await drain([{ kind: "retire", threadId: "t1" }], h.deps);

    expect(lorebook.read(ENTRY)?.enabled).toBe(false);
    expect(h.store.getState().world.threads[0].status).toBe("satisfied");
    expect(outcome.remaining).toEqual([]);
    expect(outcome.executed).toEqual([{ kind: "retire", threadId: "t1" }]);
  });

  it("goes through the write door, so the writer's original is snapshotted", async () => {
    // The whole reason retire may not call updateEntry directly: a bypassed
    // write leaves no §5.2 snapshot, and a later revise would then record
    // `enabled: false` as the writer's original.
    lorebook.seed({
      id: ENTRY,
      displayName: "The debt",
      text: "owed",
      enabled: true,
    });
    const h = harness([thread("t1", { lorebookEntryId: ENTRY })]);

    await drain([{ kind: "retire", threadId: "t1" }], h.deps);

    expect(story.get(lorebookOriginalKey(ENTRY))).toMatchObject({
      id: ENTRY,
      enabled: true,
      text: "owed",
    });
  });

  it("writes no lb: record, because a flag flip wrote no text", async () => {
    lorebook.seed({
      id: ENTRY,
      displayName: "The debt",
      text: "owed",
      enabled: true,
    });
    const h = harness([thread("t1", { lorebookEntryId: ENTRY })]);

    await drain([{ kind: "retire", threadId: "t1" }], h.deps);

    expect(
      await api.v1.historyStorage.get(lorebookRecordKey(ENTRY), h.deps.nodeId),
    ).toBeUndefined();
  });

  it("marks a thread with no lorebook entry satisfied and writes nothing", async () => {
    const h = harness([thread("t1")]);

    const outcome = await drain([{ kind: "retire", threadId: "t1" }], h.deps);

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(h.store.getState().world.threads[0].status).toBe("satisfied");
    expect(outcome.executed).toHaveLength(1);
  });

  it("skips a thread the World no longer holds, and does not requeue it", async () => {
    const h = harness([]);

    const outcome = await drain([{ kind: "retire", threadId: "gone" }], h.deps);

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
  });
});

// ───────────────────────────── the other three ─────────────────────────────

describe("drain — the kinds Tasks 3–5 fill in", () => {
  it("logs revise, open and condense without touching the lorebook", async () => {
    const h = harness();
    const queue: Intent[] = [
      { kind: "revise", entityId: "e1" },
      { kind: "open", subject: "the sealed letter" },
      { kind: "condense", entryId: "lb1" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(outcome.remaining).toEqual([]);
    expect(logged).toContain("[engine] intent (not executed): revise:e1");
    expect(logged).toContain(
      "[engine] intent (not executed): open:the sealed letter",
    );
    expect(logged).toContain("[engine] intent (not executed): condense:lb1");
  });
});

// ───────────────────────────────── the budget ─────────────────────────────────

describe("drain — the budget", () => {
  it("prices every intent kind from §3.3", () => {
    expect(INTENT_MAX_TOKENS).toEqual({
      retire: 0,
      open: 150,
      revise: 1024,
      condense: 1024,
    });
  });

  it("defers an action the bucket cannot cover, leaving it queued", async () => {
    // §3.3: drain while the budget stays above a reserve sufficient for the
    // next triage. 1024 + 200 > 500, so the revise waits for another pass.
    budget(500);
    const h = harness();

    const outcome = await drain([{ kind: "revise", entityId: "e1" }], h.deps);

    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([{ kind: "revise", entityId: "e1" }]);
  });

  it("keeps the triage reserve, not just the action's own cost", async () => {
    // Exactly enough for the rewrite and nothing for the next triage call.
    budget(INTENT_MAX_TOKENS.revise);
    const h = harness();
    expect(
      (await drain([{ kind: "revise", entityId: "e1" }], h.deps)).remaining,
    ).toHaveLength(1);

    budget(INTENT_MAX_TOKENS.revise + TRIAGE_MAX_TOKENS);
    expect(
      (await drain([{ kind: "revise", entityId: "e1" }], h.deps)).remaining,
    ).toEqual([]);
  });

  it("spends one entry rewrite, not two", async () => {
    // §3.3's whole asymmetry: "one entry rewrite, or several cheap actions, but
    // not both." Nothing hardcodes that — it falls out of re-reading the bucket
    // between actions. The two readings are what a real bucket says before and
    // after a 1024-token rewrite: 1848 clears 1024 + the 200 reserve, 824 does
    // not. A drain that read the bucket once would spend both.
    vi.mocked(api.v1.script.getAllowedOutput)
      .mockReturnValueOnce(2048 - TRIAGE_MAX_TOKENS)
      .mockReturnValue(2048 - TRIAGE_MAX_TOKENS - INTENT_MAX_TOKENS.revise);
    const h = harness();
    const queue: Intent[] = [
      { kind: "revise", entityId: "e1" },
      { kind: "condense", entryId: "lb1" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(outcome.remaining).toEqual([{ kind: "condense", entryId: "lb1" }]);
    // The first was reached and consumed; the second never was.
    expect(logged).toContain("[engine] intent (not executed): revise:e1");
    expect(logged.join("\n")).toContain("[engine] deferring condense:lb1");
  });

  it("does not let a cheap action jump the queue ahead of a deferred one", async () => {
    // FIFO among the costly actions: skipping ahead would starve the expensive
    // ones indefinitely, and those are the scarce operation §3.3 cares about.
    budget(500);
    const h = harness();
    const queue: Intent[] = [
      { kind: "revise", entityId: "e1" },
      { kind: "open", subject: "the sealed letter" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual(queue);
  });

  it("never blocks a free action behind a deferred one", async () => {
    // §3.3: "Retiring a satisfied thread never queues, because it costs zero
    // output tokens. The action that most protects context health is free."
    budget(0);
    lorebook.seed({
      id: ENTRY,
      displayName: "The debt",
      text: "owed",
      enabled: true,
    });
    const h = harness([thread("t1", { lorebookEntryId: ENTRY })]);
    const queue: Intent[] = [
      { kind: "revise", entityId: "e1" },
      { kind: "retire", threadId: "t1" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(outcome.executed).toEqual([{ kind: "retire", threadId: "t1" }]);
    expect(outcome.remaining).toEqual([{ kind: "revise", entityId: "e1" }]);
    expect(lorebook.read(ENTRY)?.enabled).toBe(false);
  });
});
