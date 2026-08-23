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
  revisionsIn,
  type DrainDeps,
} from "../../../src/core/engine/execute";
import type { Intent } from "../../../src/core/engine/loop-machine";
import { TRIAGE_MAX_TOKENS } from "../../../src/core/engine/triage-strategy";
import {
  lorebookCondensedKey,
  lorebookOriginalKey,
} from "../../../src/core/keys";
import { REVISE_MAX_TOKENS } from "../../../src/core/engine/revise-strategy";
import { CONDENSE_MAX_TOKENS } from "../../../src/core/engine/condense";
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
    anchorParagraph: null,
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
      assessment: {
        backlog: 1,
        newText: "The press took Ada's left hand.",
        candidateIds: [],
        paragraphCount: 90,
      },
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

// ────────────────────────────────── open ──────────────────────────────────

const OPEN: Intent = { kind: "open", subject: "the letter under the board" };

describe("drain — open", () => {
  it("creates the thread and binds a lorebook entry to it", async () => {
    // `threadLorebookEntrySet` has had no caller since phase 5 built it. This
    // is it: the thread lands first, the entry is created from the thread the
    // reducer actually kept, and the id is bound back.
    const h = harness();

    const outcome = await drain([OPEN], h.deps);

    const [thread] = h.store.getState().world.threads;
    expect(thread.title).toBe("the letter under the board");
    expect(thread.text).toBe("One-handed now.");
    expect(thread.lorebookEntryId).toBe(lorebook.created()[0].id);
    expect(outcome.executed).toEqual([OPEN]);
  });

  it("gives the entry the forgetting detector, not a set of keys", async () => {
    const h = harness();

    await drain([OPEN], h.deps);

    const entry = lorebook.created()[0];
    expect(entry.advancedConditions?.[0].type).toBe("not");
    expect(entry.forceActivation).toBe(true);
    expect(entry.text).toBe("One-handed now.");
  });

  it("anchors the thread at the paragraph the pass read to", async () => {
    // §4.5's anchor. `assessment.paragraphCount` is the branch's own count, so
    // undo moves the comparison with it — which is why the anchor is a
    // paragraph index rather than a clock reading.
    const h = harness();

    await drain([OPEN], h.deps);

    expect(h.store.getState().world.threads[0].anchorParagraph).toBe(90);
  });

  it("casts the entities the subject names", async () => {
    // Without a cast the detector probes only for the title, which is prose and
    // rarely appears verbatim — so the negation is always true and every
    // Engine-opened thread would be the always-on entry it exists to replace.
    const h = harness([], [entity("e1")]);

    await drain(
      [{ kind: "open", subject: "Ada's promise to the guild" }],
      h.deps,
    );

    expect(h.store.getState().world.threads[0].entityIds).toEqual(["e1"]);
  });

  it("asks for §3.3's price and no retries", async () => {
    const h = harness();

    await drain([OPEN], h.deps);

    const [, options] = h.generate.mock.calls[0];
    expect(options.max_tokens).toBe(INTENT_MAX_TOKENS.open);
    expect(options.maxRetries).toBe(0);
  });

  it("shows the model the prose the pass assessed", async () => {
    const h = harness();

    await drain([OPEN], h.deps);

    const [factory] = h.generate.mock.calls[0];
    const { messages } = await factory();
    const text = messages.map((m: Message) => m.content).join("\n");
    expect(text).toContain("The press took Ada's left hand.");
    expect(text).toContain("the letter under the board");
  });

  it("opens nothing when the model returns nothing usable", async () => {
    const h = harness();
    h.generate.mockImplementation(says("   "));

    const outcome = await drain([OPEN], h.deps);

    expect(h.store.getState().world.threads).toEqual([]);
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
  });

  it("renews a thread the subject already names instead of opening a second", async () => {
    // Triage runs hot (§3.3) and will keep naming the same commitment while it
    // is unsettled. Dedupe bounds that within one queue; across passes it is
    // this that stops the World growing a duplicate thread — and a duplicate
    // lorebook entry — for one commitment.
    const h = harness([
      thread("t1", {
        title: "The Letter Under The Board",
        lorebookEntryId: ENTRY,
        anchorParagraph: 4,
      }),
    ]);

    const outcome = await drain([OPEN], h.deps);

    expect(h.store.getState().world.threads).toHaveLength(1);
    expect(h.store.getState().world.threads[0].anchorParagraph).toBe(90);
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([OPEN]);
  });

  it("does not count as an entry rewrite", () => {
    // §9.1's ∆ is entries the Engine rewrote. Opening a thread writes a new
    // entry rather than rewriting one of the writer's.
    expect(revisionsIn([OPEN])).toBe(0);
  });

  it("requeues an open the writer collided with", async () => {
    const h = harness();
    h.generate.mockRejectedValue(
      new Error("A generation is already in progress"),
    );

    const outcome = await drain([OPEN], h.deps);

    expect(outcome.remaining).toEqual([OPEN]);
    expect(h.store.getState().world.threads).toEqual([]);
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

// ───────────────────────────────── condense ─────────────────────────────────

const BLOATED_ENTRY = "entity-entry-2";

/** An entry long enough to be worth compacting, and an entity holding it. */
const SPRAWL = `Ada\nType: Character\n\n${"She is a locksmith of some considerable skill. ".repeat(40)}`;

function condensable(text = SPRAWL) {
  lorebook.seed({
    id: BLOATED_ENTRY,
    displayName: "Ada",
    text,
    keys: ["ada"],
    enabled: true,
  } as LorebookEntry);
  return harness(
    [],
    [entity("e2", { lorebookEntryId: BLOATED_ENTRY, name: "Ada" })],
  );
}

/** A compaction the guards accept: shorter than the entry, nowhere near a
 *  summary of it. */
const COMPACTED = "She is a skilled locksmith. ".repeat(30);

const CONDENSE: Intent = { kind: "condense", entryId: BLOATED_ENTRY };

describe("drain — condense", () => {
  it("rewrites the entry with the compaction the model returned", async () => {
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));

    const outcome = await drain([CONDENSE], h.deps);

    const text = lorebook.read(BLOATED_ENTRY)?.text ?? "";
    expect(text).toContain("She is a skilled locksmith.");
    expect(text.length).toBeLessThan(SPRAWL.length);
    expect(outcome.executed).toEqual([CONDENSE]);
    expect(outcome.remaining).toEqual([]);
  });

  it("goes through the same door a revise does, so §5.2's original survives", async () => {
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));

    await drain([CONDENSE], h.deps);

    expect(story.get(lorebookOriginalKey(BLOATED_ENTRY))).toMatchObject({
      id: BLOATED_ENTRY,
      text: SPRAWL,
    });
  });

  it("writes the same lb: record a revise does, so §7 cannot tell them apart", async () => {
    // §5.1: "the same `lb:<entryId>` record so history reconciliation treats it
    // identically."
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));

    await drain([CONDENSE], h.deps);

    expect(
      await api.v1.historyStorage.get(
        lorebookRecordKey(BLOATED_ENTRY),
        h.deps.nodeId,
      ),
    ).toMatchObject({ entryId: BLOATED_ENTRY });
  });

  it("asks for §3.3's price and no retries", async () => {
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));

    await drain([CONDENSE], h.deps);

    expect(h.generate.mock.calls[0][1]).toMatchObject({
      max_tokens: CONDENSE_MAX_TOKENS,
      maxRetries: 0,
    });
  });

  it("shows the model the entry as it stands, not what Redux remembers", async () => {
    const h = condensable("Hand-edited thirty seconds ago. " + SPRAWL);
    h.generate.mockImplementation(says(COMPACTED));

    await drain([CONDENSE], h.deps);

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const { messages } = await factory();
    expect(messages.map((m) => m.content).join("\n")).toContain(
      "Hand-edited thirty seconds ago.",
    );
  });

  it("leaves the entry alone when the answer is a summary rather than a compaction", async () => {
    // The one failure §5.1 names, arriving as a well-formed two-sentence entry
    // that reads better than the original and has thrown most of it away.
    const h = condensable();
    h.generate.mockImplementation(says("A locksmith."));

    const outcome = await drain([CONDENSE], h.deps);

    expect(lorebook.read(BLOATED_ENTRY)?.text).toBe(SPRAWL);
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
    expect(logged.join("\n")).toContain("[engine] condense");
  });

  it("counts as an entry the Engine touched", async () => {
    // §9.1's ∆ is an activity level, and a condense is a rewrite of the
    // writer's entry — exactly what they would want to know happened.
    expect(revisionsIn([CONDENSE, REVISE])).toBe(2);
    expect(revisionsIn([{ kind: "retire", threadId: "t1" }])).toBe(0);
  });

  it("marks how long it left the entry, so the next pass does not do it again", async () => {
    // Without the mark, an entry whose facts do not fit under the threshold is
    // re-condensed on every pass forever — each attempt spending §3.3's one
    // entry rewrite, each one dropping a little more.
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));

    await drain([CONDENSE], h.deps);

    const mark = story.get(lorebookCondensedKey(BLOATED_ENTRY));
    expect(mark).toBe(lorebook.read(BLOATED_ENTRY)?.text?.length);
  });

  it("marks a declined attempt too, at the length it found", async () => {
    // A compaction the model could not usefully produce is not one to retry on
    // the next pass: it costs the same 1024 tokens to fail again.
    const h = condensable();
    h.generate.mockImplementation(says("A locksmith."));

    await drain([CONDENSE], h.deps);

    expect(story.get(lorebookCondensedKey(BLOATED_ENTRY))).toBe(SPRAWL.length);
  });

  it("marks nothing when the writer collided with it", async () => {
    // A collision is not an attempt — the model never answered. Marking here
    // would defer the work by a paragraph of growth for a refusal that costs
    // nothing and clears on its own (§3.4).
    const h = condensable();
    h.generate.mockRejectedValue(
      new Error("A generation is already in progress"),
    );

    const outcome = await drain([CONDENSE], h.deps);

    expect(story.get(lorebookCondensedKey(BLOATED_ENTRY))).toBeUndefined();
    expect(outcome.remaining).toEqual([CONDENSE]);
  });

  it("skips an entry the writer deleted, without resurrecting it", async () => {
    const h = harness();

    const outcome = await drain(
      [{ kind: "condense", entryId: "gone-from-the-book" }],
      h.deps,
    );

    expect(h.generate).not.toHaveBeenCalled();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([]);
  });

  it("lets a failure it does not recognise reach the pass", async () => {
    const h = condensable();
    h.generate.mockRejectedValue(new Error("the sky fell"));

    await expect(drain([CONDENSE], h.deps)).rejects.toThrow("the sky fell");
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
    // The first was reached — the door read its entry, found the writer had
    // deleted it and declined — and the second never was.
    expect(
      vi.mocked(api.v1.lorebook.entry).mock.calls.map((c) => c[0]),
    ).toEqual(["lb0"]);
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
    "condense.ts",
    "triage-strategy.ts",
    "open-strategy.ts",
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

  it("thread-bind.ts creates entries but never rewrites one", () => {
    // The one module that reaches the lorebook API without going through the
    // door, and only for the call the door cannot make: `createEntry` invents
    // an entry, so there is no live text to read first and no original to
    // snapshot. Every REWRITE it performs — the condition rebuild — goes
    // through `writeLorebookEntry` like any other Engine edit.
    const src = code(readFileSync(join(ENGINE, "thread-bind.ts"), "utf8"));
    expect(src).toContain("api.v1.lorebook.createEntry");
    expect(src).not.toContain("api.v1.lorebook.updateEntry");
  });
});
