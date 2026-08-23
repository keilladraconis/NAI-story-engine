import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore, type Store } from "nai-store";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  drain,
  INTENT_MAX_TOKENS,
  type DrainDeps,
} from "../../../src/core/engine/execute";
import type { Intent } from "../../../src/core/engine/loop-machine";
import { TRIAGE_MAX_TOKENS } from "../../../src/core/engine/triage-strategy";
import { lorebookOriginalKey } from "../../../src/core/keys";
import { REVISE_MAX_TOKENS } from "../../../src/core/engine/revise-strategy";
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

function entity(id: string, over: Partial<WorldEntity> = {}): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name: "Ada",
    summary: "A locksmith.",
    ...over,
  };
}

let history: HistoryFake;
let lorebook: LorebookFake;
let story: StoryStorageFake;
let logged: string[];

type Harness = {
  store: Store<RootState>;
  generate: ReturnType<typeof vi.fn>;
  deps: DrainDeps;
};

/** What the model says when the Engine asks for a revision. */
function says(text: string, finish_reason = "stop") {
  return async () => ({
    choices: [{ text, index: 0, token_ids: [], finish_reason }],
  });
}

function harness(
  threads: Thread[] = [],
  entities: WorldEntity[] = [],
): Harness {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        threads,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
      },
    }),
  );
  const generate = vi.fn(says("One-handed now."));
  return {
    store,
    generate,
    deps: {
      dispatch: store.dispatch,
      getState: store.getState,
      nodeId: history.current(),
      newText: "The press took Ada's left hand.",
      genX: { generate } as unknown as DrainDeps["genX"],
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

describe("drain — the kinds Tasks 4–5 fill in", () => {
  it("logs open and condense without touching the lorebook", async () => {
    const h = harness();
    const queue: Intent[] = [
      { kind: "open", subject: "the sealed letter" },
      { kind: "condense", entryId: "lb1" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(outcome.remaining).toEqual([]);
    expect(logged).toContain(
      "[engine] intent (not executed): open:the sealed letter",
    );
    expect(logged).toContain("[engine] intent (not executed): condense:lb1");
  });
});

// ───────────────────────────────── revise ─────────────────────────────────

const ENTITY_ENTRY = "entity-entry-1";

/** An entity, its live lorebook entry, and a queue holding one revise. */
function revisable(
  text = "Ada\nType: Character\n\nA locksmith with two hands.",
) {
  lorebook.seed({
    id: ENTITY_ENTRY,
    displayName: "Ada",
    text,
    keys: ["ada"],
    enabled: true,
  } as LorebookEntry);
  return harness(
    [],
    [entity("e1", { lorebookEntryId: ENTITY_ENTRY, name: "Ada" })],
  );
}

const REVISE: Intent = { kind: "revise", entityId: "e1" };

describe("drain — revise", () => {
  it("rewrites the entity's entry with what the model returned", async () => {
    const h = revisable();

    const outcome = await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toContain("One-handed now.");
    expect(outcome.executed).toEqual([REVISE]);
    expect(outcome.remaining).toEqual([]);
  });

  it("keeps the house header, so a revised entry looks like a generated one", async () => {
    const h = revisable();

    await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toMatch(
      /^Ada\nType: Character\n/,
    );
  });

  it("goes through the write door: the writer's original is snapshotted first", async () => {
    // §5.2. Without the door there is no snapshot, and the writer's entry is
    // overwritten by a machine with nothing kept.
    const h = revisable("A locksmith with two hands.");

    await drain([REVISE], h.deps);

    expect(story.get(lorebookOriginalKey(ENTITY_ENTRY))).toMatchObject({
      id: ENTITY_ENTRY,
      text: "A locksmith with two hands.",
    });
  });

  it("records what it wrote, so §7 has something to reconcile", async () => {
    const h = revisable();

    await drain([REVISE], h.deps);

    const record = await api.v1.historyStorage.get(
      lorebookRecordKey(ENTITY_ENTRY),
      h.deps.nodeId,
    );
    expect(record).toMatchObject({ entryId: ENTITY_ENTRY });
  });

  it("snapshots before it writes, never after", async () => {
    // An entry snapshotted after the rewrite would preserve the Engine's own
    // output as the writer's original — §5.2 inverted.
    const h = revisable("original text");
    const order: string[] = [];
    vi.mocked(api.v1.storyStorage.setIfAbsent).mockImplementation(
      async (key: string) => {
        order.push(`snapshot:${key}`);
        return true;
      },
    );
    vi.mocked(api.v1.lorebook.updateEntry).mockImplementation(async () => {
      order.push("write");
    });

    await drain([REVISE], h.deps);

    expect(order[0]).toBe(`snapshot:${lorebookOriginalKey(ENTITY_ENTRY)}`);
    expect(order).toContain("write");
  });

  it("shows the model the entry as it stands, not what Redux remembers", async () => {
    // §5's read-then-write: a hand-edit made between triage and the drain is
    // simply part of the input.
    const h = revisable("Hand-edited thirty seconds ago.");

    await drain([REVISE], h.deps);

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const { messages } = await factory();
    expect(messages.map((m) => m.content).join("\n")).toContain(
      "Hand-edited thirty seconds ago.",
    );
  });

  it("shows the model the prose the pass assessed", async () => {
    const h = revisable();

    await drain([REVISE], h.deps);

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const { messages } = await factory();
    expect(messages.map((m) => m.content).join("\n")).toContain(
      "The press took Ada's left hand.",
    );
  });

  it("asks for no more than §3.3's price", async () => {
    const h = revisable();

    await drain([REVISE], h.deps);

    expect(h.generate.mock.calls[0][1]).toMatchObject({
      max_tokens: REVISE_MAX_TOKENS,
      // GenX retries a refusal itself otherwise, holding the pass for a minute.
      maxRetries: 0,
    });
  });

  it("leaves the entry alone when the model returns nothing usable", async () => {
    const h = revisable("A locksmith with two hands.");
    h.generate.mockImplementation(says("   "));

    const outcome = await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toBe(
      "A locksmith with two hands.",
    );
    expect(outcome.executed).toEqual([]);
    // Consumed, not requeued: triage runs hot and will name it again.
    expect(outcome.remaining).toEqual([]);
    expect(
      await api.v1.historyStorage.get(
        lorebookRecordKey(ENTITY_ENTRY),
        h.deps.nodeId,
      ),
    ).toBeUndefined();
  });

  it("never writes half a word", async () => {
    const h = revisable();
    h.generate.mockImplementation(
      says("Lost the hand. The press took it clean. She still wo", "length"),
    );

    await drain([REVISE], h.deps);

    const text = lorebook.read(ENTITY_ENTRY)?.text ?? "";
    expect(text).toContain("The press took it clean.");
    expect(text).not.toContain("She still wo");
  });

  it("spends one generation on a rewrite, never a continuation", async () => {
    // The hand-driven path answers truncation with up to four calls; the drain
    // budgeted for one, and the second would come out of the writer's bucket.
    const h = revisable();
    h.generate.mockImplementation(
      says("Lost the hand. She still wo", "length"),
    );

    await drain([REVISE], h.deps);

    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it("skips an entity the World no longer holds, spending nothing", async () => {
    const h = harness();

    const outcome = await drain([REVISE], h.deps);

    expect(h.generate).not.toHaveBeenCalled();
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
  });

  it("skips a draft entity, which has no entry to rewrite", async () => {
    const h = harness([], [entity("e1", { lifecycle: "draft" })]);

    const outcome = await drain([REVISE], h.deps);

    expect(h.generate).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
  });

  it("skips an entry the writer deleted, without resurrecting it", async () => {
    const h = harness(
      [],
      [entity("e1", { lorebookEntryId: "gone-from-the-book" })],
    );

    const outcome = await drain([REVISE], h.deps);

    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
  });

  it("requeues a revise the writer collided with, and stops the drain", async () => {
    // §3.4: a concurrency refusal is routine and self-clearing. The work is
    // still wanted (§3.3 — prose does not un-happen), so it must not be
    // consumed, and the writer is plainly busy, so nothing costly follows it.
    const h = revisable();
    h.generate.mockRejectedValue(
      new Error("A generation is already in progress"),
    );
    const queue: Intent[] = [REVISE, { kind: "condense", entryId: "lb1" }];

    const outcome = await drain(queue, h.deps);

    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual(queue);
  });

  it("lets a failure it does not recognise reach the pass", async () => {
    // The pass owns classification and the stall counter. A drain that
    // swallowed real faults would leave the HUD's ⚠ permanently dark.
    const h = revisable();
    h.generate.mockRejectedValue(new Error("the sky fell"));

    await expect(drain([REVISE], h.deps)).rejects.toThrow("the sky fell");
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
      { kind: "condense", entryId: "lb0" },
      { kind: "condense", entryId: "lb1" },
    ];

    const outcome = await drain(queue, h.deps);

    expect(outcome.remaining).toEqual([{ kind: "condense", entryId: "lb1" }]);
    // The first was reached and consumed; the second never was.
    expect(logged).toContain("[engine] intent (not executed): condense:lb0");
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

// ─────────────────────────── the door is the only writer ───────────────────────────

/** Comments out: both files explain the rule below in prose and name the very
 *  call they forbid, so scanning the prose would bully the documentation into
 *  silence. Same idiom as `thread-source.test.ts`. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("no Engine action can write around the write door", () => {
  // The behavioural tests above prove the snapshot happens for the paths they
  // exercise. This proves there is no OTHER path: a revise that called
  // `updateEntry` itself would take no §5.2 snapshot and write no `lb:` record,
  // and it would pass every test that only checks the entry's text afterwards.
  const ENGINE = join(__dirname, "../../../src/core/engine");

  for (const file of [
    "execute.ts",
    "revise-strategy.ts",
    "triage-strategy.ts",
  ]) {
    it(`${file} never calls the lorebook API directly`, () => {
      const src = code(readFileSync(join(ENGINE, file), "utf8"));
      expect(src).not.toContain("api.v1.lorebook");
    });
  }

  it("lorebook-write.ts is the one module that does", () => {
    const src = code(readFileSync(join(ENGINE, "lorebook-write.ts"), "utf8"));
    expect(src).toContain("api.v1.lorebook.updateEntry");
  });
});
