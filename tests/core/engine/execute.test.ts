import { describe, it, expect, beforeEach, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
import { EDIT_PANE_TITLE, lorebookCondensedKey } from "../../../src/core/keys";
import { uiLorebookEntrySelected } from "../../../src/core/store/slices/ui";
import { REVISE_MAX_TOKENS } from "../../../src/core/engine/revise-strategy";
import { CONDENSE_MAX_TOKENS } from "../../../src/core/engine/condense";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

// ─────────────────────────────── the harness ───────────────────────────────

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
      genX: { generate } as unknown as DrainDeps["genX"],
      log: async (...messages: unknown[]) => {
        logged.push(messages.map(String).join(" "));
      },
    },
  };
}

/** Everything the model was shown by the drain's first generation, joined. */
async function shownTo(h: Harness): Promise<string> {
  const factory = h.generate.mock.calls[0][0] as () => Promise<{
    messages: Message[];
  }>;
  return (await factory()).messages.map((m) => m.content ?? "").join("\n");
}

function budget(tokens: number): void {
  vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(tokens);
}

beforeEach(() => {
  lorebook = installLorebookFake();
  story = installStoryStorageFake();
  logged = [];
  budget(2048);
});

// ───────────────────────────────── revise ─────────────────────────────────

/** The prose a revise intent carries, which is what it is shown (§3.3's "a
 *  queued intent does not go stale"). */
const PASS_PROSE = "The press took Ada's left hand.";

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

const REVISE: Intent = { kind: "revise", entityId: "e1", prose: PASS_PROSE };

describe("drain — revise", () => {
  it("rewrites the entity's entry with what the model returned", async () => {
    const h = revisable();

    const outcome = await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toContain("One-handed now.");
    expect(outcome.executed).toEqual([REVISE]);
    expect(outcome.remaining).toEqual([]);
  });

  it("is shown the prose the INTENT carries, not the prose this pass read", async () => {
    // The severe case this field exists for. A revise the budget deferred runs
    // on a LATER pass, whose `newText` is different prose and whose watermark
    // has moved past the sentences that raised it — so an arm reading the
    // pass's prose rewrites the whole entry against a scene the entity was
    // never in, under a prompt that says what it leaves out is deleted.
    const h = revisable();
    const deferred: Intent = {
      kind: "revise",
      entityId: "e1",
      prose: "Ada put her hand into the press.",
    };

    await drain([deferred], h.deps);

    expect(await shownTo(h)).toContain("Ada put her hand into the press.");
    expect(await shownTo(h)).not.toContain(PASS_PROSE);
  });

  it("writes the committed name as the header, not the pane's half-typed one", async () => {
    // `EDIT_PANE_TITLE` is mirrored on every keystroke, so it is the name the
    // writer is part-way through typing. The DRAFT layer exists so a
    // hand-pressed Generate reflects that; the Engine is the first unattended
    // caller and inherited it unexamined, which puts `Adal` at the top of an
    // entry it rewrote while nobody was looking.
    const h = revisable();
    h.store.dispatch(
      uiLorebookEntrySelected({ entryId: ENTITY_ENTRY, categoryId: null }),
    );
    story.set(EDIT_PANE_TITLE, "Adal");

    await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toMatch(/^Ada\nType: Character/);
    expect(await shownTo(h)).not.toContain("Adal\nType:");
  });

  it("keeps the house header, so a revised entry looks like a generated one", async () => {
    const h = revisable();

    await drain([REVISE], h.deps);

    expect(lorebook.read(ENTITY_ENTRY)?.text).toMatch(
      /^Ada\nType: Character\n/,
    );
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
    // Declined at the door, so nothing reached the lorebook at all.
    expect(lorebook.updates()).toEqual([]);
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
  it("writes the committed name as the header, not the pane's half-typed one", async () => {
    // Same contract as revise's, and worth its own test rather than an
    // assertion that the two arms look alike: they are deliberately the same
    // shape, which is exactly how one of them ends up asking a different
    // question than the other.
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));
    h.store.dispatch(
      uiLorebookEntrySelected({ entryId: BLOATED_ENTRY, categoryId: null }),
    );
    story.set(EDIT_PANE_TITLE, "Adal");

    await drain([CONDENSE], h.deps);

    expect(lorebook.read(BLOATED_ENTRY)?.text).toMatch(/^Ada\nType: Character/);
  });

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

  it("reads the entry live, the same way a revise does", async () => {
    // §5.1: condense obeys every rule revision does, and the one that matters
    // here is read-then-write — the compaction is built from the entry as it
    // stands, not from what assessment measured a generation ago.
    const h = condensable();
    h.generate.mockImplementation(says(COMPACTED));
    lorebook.seed({
      id: BLOATED_ENTRY,
      displayName: "Ada",
      text: `${SPRAWL} And then the writer added a line.`,
      enabled: true,
    });

    await drain([CONDENSE], h.deps);

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const { messages } = await factory();
    expect(messages.map((m) => m.content).join("\n")).toContain(
      "And then the writer added a line.",
    );
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
    expect(revisionsIn([])).toBe(0);
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
      revise: 1024,
      condense: 1024,
    });
  });

  it("defers an action the bucket cannot cover, leaving it queued", async () => {
    // §3.3: drain while the budget stays above a reserve sufficient for the
    // next triage. 1024 + 200 > 500, so the revise waits for another pass.
    budget(500);
    const h = harness();

    const outcome = await drain([REVISE], h.deps);

    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([REVISE]);
  });

  it("keeps the triage reserve, not just the action's own cost", async () => {
    // Exactly enough for the rewrite and nothing for the next triage call.
    budget(INTENT_MAX_TOKENS.revise);
    const h = harness();
    expect((await drain([REVISE], h.deps)).remaining).toHaveLength(1);

    budget(INTENT_MAX_TOKENS.revise + TRIAGE_MAX_TOKENS);
    expect((await drain([REVISE], h.deps)).remaining).toEqual([]);
  });

  it("re-reads the bucket between actions rather than once at the start", async () => {
    // The budget check's own property, and all this test claims: a drain that
    // read `getAllowedOutput()` once would believe it could afford two 1024
    // rewrites out of a bucket that covers one. The two readings here are a
    // bucket that has been debited the full ceiling — which is ONE way a host
    // might account for a rewrite and not a fact about this one, which is why
    // the per-pass guarantee is tested separately below and not from here.
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

  it("spends one entry rewrite per pass whatever the bucket says", async () => {
    // §3.3's asymmetry, and the changelog's promise that a pass defers a
    // rewrite rather than taking it out of the writer's next generation. Left
    // to the budget check alone that promise rests on the host debiting the
    // REQUESTED 1024; if it debits what was produced — a rewrite typically
    // lands at 200–400 — the bucket still clears 1024 + 200 afterwards and the
    // drain spends three or four. Nothing here has verified which the host
    // does, so the budget is held at FULL: the check can never be the thing
    // that stops it, and only the cap can.
    budget(2048);
    const h = harness();
    const queue: Intent[] = [
      { kind: "condense", entryId: "lb0" },
      { kind: "condense", entryId: "lb1" },
      { kind: "revise", entityId: "e1", prose: PASS_PROSE },
    ];

    const outcome = await drain(queue, h.deps);

    expect(outcome.remaining).toEqual(queue.slice(1));
    expect(
      vi.mocked(api.v1.lorebook.entry).mock.calls.map((c) => c[0]),
    ).toEqual(["lb0"]);
    expect(logged.join("\n")).toContain(
      "[engine] deferring condense:lb1 — this pass has already spent its entry rewrite",
    );
  });

  it("counts a rewrite it reached, not one that wrote", async () => {
    // A revision the model returned nothing usable for still SPENT its
    // generation: the door declined the write, the bucket did not un-debit.
    // Counting writes rather than attempts would let a pass that declined once
    // go straight on and start a second 1024-token call.
    budget(2048);
    const h = revisable();
    h.generate.mockImplementation(says(""));

    const outcome = await drain(
      [REVISE, { kind: "condense", entryId: "lb1" }],
      h.deps,
    );

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(outcome.executed).toEqual([]);
    expect(outcome.remaining).toEqual([{ kind: "condense", entryId: "lb1" }]);
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
  // The behavioural tests above prove read-then-write for the paths they
  // exercise. This proves there is no OTHER path: a revise that called
  // `updateEntry` itself could build its patch from an entry it read before the
  // generation started, and it would pass every test that only checks the
  // entry's text afterwards.
  const ENGINE = join(__dirname, "../../../src/core/engine");

  /** The two modules allowed to name the lorebook API, and why.
   *
   *  `lorebook-write.ts` IS the door. `thread-bind.ts` calls `createEntry` and
   *  `entry`, which the door cannot stand in front of: a create invents an
   *  entry, so there is no live text to read first. Every REWRITE it performs
   *  goes through `writeLorebookEntry` like any other, and the test below holds
   *  it to that. */
  const EXEMPT = ["lorebook-write.ts", "thread-bind.ts"];

  /** Every other module in the directory, read rather than listed.
   *
   *  **The list used to be six literal filenames**, against a directory of
   *  sixteen — so a seventh module calling `updateEntry`, which is the exact
   *  regression this guard exists to catch, passed in silence. A guard whose
   *  coverage is hand-maintained is a guard that stops covering whatever
   *  arrives next. */
  const guarded = readdirSync(ENGINE)
    .filter((file) => file.endsWith(".ts") && !EXEMPT.includes(file))
    .sort();

  it("covers the whole directory, so a new module is guarded by existing", () => {
    // Reading the directory is only a guard if it actually found it. A wrong
    // path yields an empty list and every assertion below passes vacuously.
    expect(guarded).toContain("execute.ts");
    expect(guarded).toContain("assess.ts");
    expect(guarded.length).toBeGreaterThan(10);
  });

  for (const file of guarded) {
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
    // an entry, so there is no live text to read first. Every REWRITE it
    // performs — the condition rebuild — goes through `writeLorebookEntry` like
    // any other Engine edit.
    const src = code(readFileSync(join(ENGINE, "thread-bind.ts"), "utf8"));
    expect(src).toContain("api.v1.lorebook.createEntry");
    expect(src).not.toContain("api.v1.lorebook.updateEntry");
  });
});

describe("every Engine generation refuses rather than parks (§3.5)", () => {
  const SRC = join(__dirname, "../../../src/core/engine");

  // A source scan, because the alternative is a mock that proves GenX was
  // called with a flag rather than that EVERY call carries it. The failure is
  // silent and remote: a call without it parks, GenX's parked status is
  // instance-wide, and the header renders a Continue widget for background work
  // the writer never asked for.
  it("execute.ts passes fastRejection on every genX.generate", () => {
    const src = readFileSync(join(SRC, "execute.ts"), "utf8");
    const calls = src.split(/genX\.generate\(/).slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // The params object is the second argument; `fastRejection` must appear
      // before the call's closing depth. Cheap proxy: within the next 900
      // characters, which comfortably covers the longest param block here.
      expect(call.slice(0, 900)).toContain("fastRejection: true");
    }
  });

  it("the pass's triage params carry it too", () => {
    // engine-loop builds its params in a helper rather than inline, so the
    // per-call scan above cannot see them.
    const src = readFileSync(
      join(SRC, "../store/effects/engine-loop.ts"),
      "utf8",
    );
    expect(src).toContain("fastRejection: true");
  });
});
