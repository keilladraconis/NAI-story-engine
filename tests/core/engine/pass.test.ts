import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  createEnginePass,
  enginePassRequested,
  registerEngineLoopEffects,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import { rootReducer } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import { persistedDataLoaded } from "../../../src/core/store";
import { initialWorldState } from "../../../src/core/store/slices/world";
import { QUEUE_KEY, WATERMARK_KEY } from "../../../src/core/engine/intents";
import { engineSettingsChanged } from "../../../src/core/store/slices/engine";
import {
  ENGINE_DEFAULTS,
  type EngineSettings,
} from "../../../src/core/engine/settings";
import { STORAGE_KEYS } from "../../../src/core/keys";
import { MAX_ATTEMPTS } from "../../../src/core/engine/refusal";
import {
  installHistoryFake,
  type HistoryFake,
} from "../../helpers/history-fake";
import { installLorebookFake } from "../../helpers/lorebook-fake";
import { installStoryStorageFake } from "../../helpers/story-storage-fake";
import { lorebookOriginalKey } from "../../../src/core/keys";

// ─────────────────────────────── the harness ───────────────────────────────

/** Sections as api.v1.document.scan() returns them. Ids are opaque and
 *  unordered on purpose — the pass must never assume they sort. */
function documentOf(...texts: string[]): void {
  const scanned = texts.map((text, index) => ({
    sectionId: 9000 - index * 7,
    section: { text, origin: [], formatting: [] } as Section,
    index,
  }));
  api.v1.document.scan = vi.fn(async () => scanned);
}

function sectionIdAt(index: number): number {
  return 9000 - index * 7;
}

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "A locksmith.",
  };
}

type Harness = {
  store: Store<RootState>;
  generate: ReturnType<typeof vi.fn>;
  userInteraction: ReturnType<typeof vi.fn>;
  deps: EngineLoopDeps;
  runPass: () => Promise<void>;
};

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

function harness(
  entities: WorldEntity[] = [entity("e1", "Ada")],
  threads: Thread[] = [],
): Harness {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
        threads,
      },
    }),
  );

  const generate = vi.fn(async () => ({
    choices: [{ text: "", index: 0, token_ids: [] }],
  }));
  const userInteraction = vi.fn();
  const deps: EngineLoopDeps = {
    subscribeEffect: store.subscribeEffect,
    dispatch: store.dispatch,
    getState: store.getState,
    genX: { generate, userInteraction } as unknown as EngineLoopDeps["genX"],
  };

  return {
    store,
    generate,
    userInteraction,
    deps,
    runPass: createEnginePass(deps),
  };
}

/** The NEW PROSE block triage was actually shown by the pass's first call.
 *  What a watermark is for is exactly what reaches this string. */
async function proseShownTo(h: Harness): Promise<string> {
  const factory = h.generate.mock.calls[0][0] as () => Promise<{
    messages: Message[];
  }>;
  const block = (await factory()).messages
    .map((m) => m.content ?? "")
    .find((content) => content.startsWith("=== NEW PROSE ==="));
  return (block ?? "").replace("=== NEW PROSE ===\n", "");
}

/** Reply with a triage response. */
function triageReturns(h: Harness, text: string): void {
  h.generate.mockResolvedValue({
    choices: [{ text, index: 0, token_ids: [] }],
  });
}

/** Reject the triage call, as the backend refusing or failing does. */
function triageRejects(h: Harness, error: unknown): void {
  h.generate.mockRejectedValue(error);
}

const REFUSAL = new Error("A generation is already in progress");

/** Let every pending microtask chain run. The ⚡ effect is fire-and-forget, so
 *  there is no promise to await — one macrotask turn drains the awaits behind
 *  it, and asserting that nothing happened needs them all drained. */
function settle(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

/** Register the effects, deliver a user generation, and hand back the wakeup
 *  callback WITHOUT running it — so a test can change the world in the gap
 *  between arming the timer and its firing, which is the writer's 8 seconds. */
async function armWakeup(h: Harness): Promise<() => Promise<void>> {
  let wakeup: (() => Promise<void>) | undefined;
  vi.mocked(api.v1.timers.setTimeout).mockImplementationOnce((cb) => {
    wakeup = cb as () => Promise<void>;
    return Promise.resolve(1);
  });

  registerEngineLoopEffects(h.deps);
  const hook = vi
    .mocked(api.v1.hooks.register)
    .mock.calls.filter((c) => c[0] === "onGenerationRequested")
    .pop()?.[1] as (p: {
    continuityId: string;
    model: string;
    scriptInitiated: boolean;
  }) => Promise<void>;

  await hook({ continuityId: "c1", model: "glm-4-6", scriptInitiated: false });
  if (!wakeup) throw new Error("no wakeup was armed");
  const fire = wakeup;
  return () => fire();
}

/** Put the Engine's settings where the pass now reads them: one storyStorage
 *  record, not three `api.v1.config` entries. Everything not named takes its
 *  default, which is what a real record written by the Setup form looks like. */
function configure(settings: Partial<EngineSettings> = {}): void {
  const stored: EngineSettings = { ...ENGINE_DEFAULTS, ...settings };
  vi.mocked(api.v1.storyStorage.get).mockImplementation(async (key: string) =>
    key === STORAGE_KEYS.ENGINE_SETTINGS ? stored : null,
  );
}

/** `story_engine_debug`, as `api.v1.config` answers it.
 *
 *  Set BEFORE `harness()`: the pass reads this flag once, where it is built, so
 *  a value set afterwards would arrive too late — which is the arrangement, not
 *  an accident. A `project.yaml` entry cannot change mid-session. */
function debugLogging(enabled: boolean): void {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key === "story_engine_debug" ? enabled : undefined,
  );
}

/** Every line the Engine actually logged. */
function logged(): string[] {
  return vi.mocked(api.v1.log).mock.calls.map((c) => String(c[0]));
}

/** Every value written to a record key, oldest first. */
function writesTo(key: string): unknown[] {
  return vi
    .mocked(api.v1.historyStorage.set)
    .mock.calls.filter((c) => c[0] === key)
    .map((c) => c[1]);
}

/** The whole two-paragraph document below, as `assess` joins it: the prose a
 *  first pass on this branch reads, and therefore the prose the `revise` and
 *  `open` intents it raises carry away with them (see `Intent`). */
const WHOLE_DOCUMENT = "The lock clicked.\n\nAda pocketed the letter.";

let history: HistoryFake;

describe("the pass", () => {
  beforeEach(() => {
    history = installHistoryFake();
    configure({ enabled: true });
    documentOf("The lock clicked.", "Ada pocketed the letter.");
    vi.mocked(api.v1.log).mockClear();
    // Off unless a test says otherwise — the default a writer who never opened
    // the script config has, and the state in which the HUD is the whole
    // surface.
    debugLogging(false);
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(2048);
    // The bounded backoff is tested by its call count, not by wall clock.
    vi.mocked(api.v1.timers.sleep).mockResolvedValue(undefined);
  });

  afterEach(() => {
    history.reset();
    vi.mocked(api.v1.storyStorage.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
  });

  // ─────────────────────────── a completed pass ───────────────────────────

  it("advances the watermark to the last section it read, and how much of it", async () => {
    // Not just WHICH section: NovelAI resumes generation inside a section at a
    // character offset, so the last paragraph is routinely extended in place.
    const h = harness();
    triageReturns(h, "REVISE Ada");
    await h.runPass();

    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toEqual({
      sectionId: sectionIdAt(1),
      offset: "Ada pocketed the letter.".length,
    });
  });

  it("advances the watermark even when triage names nothing", async () => {
    // The common case on quiet prose. A watermark that only moved when there
    // was work to do would re-read the same paragraphs on every pass forever.
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toEqual({
      sectionId: sectionIdAt(1),
      offset: "Ada pocketed the letter.".length,
    });
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("reads only what is past the watermark on the next pass", async () => {
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    documentOf("The lock clicked.", "Ada pocketed the letter.", "Rain again.");
    h.generate.mockClear();
    await h.runPass();

    expect(await proseShownTo(h)).toBe("Rain again.");
  });

  it("reads a last paragraph that was EXTENDED IN PLACE", async () => {
    // The failure this shape exists for. A generation resumes inside the
    // trailing section, so the sentence that finishes it belongs to a section
    // the previous pass already watermarked. With a bare section id it is never
    // read — not on this pass, and not on any later one.
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    documentOf(
      "The lock clicked.",
      "Ada pocketed the letter. She slid it under the floorboard.",
      "Then she opened the window.",
    );
    h.generate.mockClear();
    await h.runPass();

    const prose = await proseShownTo(h);
    expect(prose).toContain("She slid it under the floorboard.");
    expect(prose).toContain("Then she opened the window.");
    // ...and nothing it had already read.
    expect(prose).not.toContain("Ada pocketed the letter.");
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toEqual({
      sectionId: sectionIdAt(2),
      offset: "Then she opened the window.".length,
    });
  });

  it("treats a legacy bare-number watermark as unseen", async () => {
    // Alpha, so no migration: a watermark of the old shape reads as null and
    // the branch is re-read. That costs input tokens; the alternative is
    // skipping prose nobody has looked at.
    await api.v1.historyStorage.set(
      WATERMARK_KEY,
      sectionIdAt(1),
      history.current(),
    );
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    const prose = await proseShownTo(h);
    expect(prose).toContain("The lock clicked.");
    expect(prose).toContain("Ada pocketed the letter.");
  });

  it("enqueues what triage named and clears the queue", async () => {
    // The queue is written before the drain and re-written after it (§11), so
    // a reload between the two finds the work. The budget covers both intents,
    // so what is written back is empty — the revise finds a draft entity with
    // no entry to rewrite, and the open opens its thread.
    const h = harness();
    triageReturns(h, "REVISE Ada\nOPEN the sealed letter");
    await h.runPass();

    expect(writesTo(QUEUE_KEY)).toEqual([
      [
        { kind: "revise", entityId: "e1", prose: WHOLE_DOCUMENT },
        { kind: "open", subject: "the sealed letter", prose: WHOLE_DOCUMENT },
      ],
      [],
    ]);
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  // ─────────────────────────────── the drain ───────────────────────────────

  it("executes a retire against the writer's lorebook, then clears the queue", async () => {
    // The pass no longer logs and forgets: it acts. A drain that cleared the
    // queue without executing leaves this entry enabled and this thread open.
    const story = installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-thread",
      displayName: "The debt",
      text: "Kael owes the guild.",
      enabled: true,
    });
    const h = harness(
      [entity("e1", "Ada")],
      [thread("The debt", { lorebookEntryId: "lb-thread" })],
    );
    triageReturns(h, "RETIRE The debt");

    await h.runPass();

    expect(lorebook.read("lb-thread")?.enabled).toBe(false);
    expect(h.store.getState().world.threads[0].status).toBe("satisfied");
    // Through the door, so §5.2's original survives the retirement.
    expect(story.get(lorebookOriginalKey("lb-thread"))).toMatchObject({
      enabled: true,
    });
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("executes a revise against the writer's lorebook, and counts it", async () => {
    // The pass has to hand the drain two things it did not need for a retire:
    // the generation queue, and the prose the pass assessed. Drop either and
    // the revise cannot happen at all.
    const story = installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: "A locksmith with two hands.",
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    h.generate
      .mockResolvedValueOnce({
        choices: [{ text: "REVISE Ada", index: 0, token_ids: [] }],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            text: "Left hand gone below the wrist.",
            index: 0,
            token_ids: [],
            finish_reason: "stop",
          },
        ],
      });

    await h.runPass();

    expect(lorebook.read("lb-ada")?.text).toContain(
      "Left hand gone below the wrist.",
    );
    // §5.2's original, kept before the model was asked anything.
    expect(story.get(lorebookOriginalKey("lb-ada"))).toMatchObject({
      text: "A locksmith with two hands.",
    });
    // §9.1's ∆ leaves 0 for the first time.
    expect(h.store.getState().engine.touched).toBe(1);
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("shows the revise the same prose it showed triage", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: "x",
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    const factory = h.generate.mock.calls[1][0] as () => Promise<{
      messages: Message[];
    }>;
    const shown = (await factory()).messages
      .map((m) => m.content ?? "")
      .join("\n");
    expect(shown).toContain("Ada pocketed the letter.");
  });

  it("leaves the count alone on a pass that revised nothing", async () => {
    const h = harness();
    triageReturns(h, "");
    await h.runPass();
    expect(h.store.getState().engine.touched).toBe(0);
  });

  it("writes back what the budget could not afford, and holds", async () => {
    // Enough for triage (200) and nowhere near a 1024-token rewrite. Drop the
    // drain's budget check and the revise is consumed and lost instead.
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(300);
    const h = harness();
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([
      { kind: "revise", entityId: "e1", prose: WHOLE_DOCUMENT },
    ]);
    expect(h.store.getState().engine.phase).toBe("held");
  });

  it("runs a deferred revise against the prose that raised it, not the prose it lands in", async () => {
    // The severe case. Pass 1 names Ada and cannot pay for the rewrite; pass 2
    // is a scene Ada is not in, and by then the watermark has moved past the
    // sentences that made her entry wrong. An arm reading the RUNNING pass's
    // prose rewrites her whole entry against the harbour, under a prompt that
    // says what it leaves out is deleted.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: "x",
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);

    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(300);
    triageReturns(h, "REVISE Ada");
    await h.runPass();
    expect(h.store.getState().engine.phase).toBe("held");

    documentOf(
      "The lock clicked.",
      "Ada pocketed the letter.",
      "Snow fell on the harbour and nobody came.",
    );
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(2048);
    h.generate.mockClear();
    triageReturns(h, "");
    await h.runPass();

    const factory = h.generate.mock.calls[1][0] as () => Promise<{
      messages: Message[];
    }>;
    const shown = (await factory()).messages
      .map((m) => m.content ?? "")
      .join("\n");
    expect(shown).toContain("Ada pocketed the letter.");
    expect(shown).not.toContain("Snow fell on the harbour");
  });

  it("drops a persisted revise that carries no prose rather than guessing one", async () => {
    // A record an older build wrote, or a hand-edited one. There is no honest
    // prose to run it against and the running pass's is the wrong answer, so
    // the queue read refuses it — triage names the entry again the next time
    // the story makes it wrong.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: "x",
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    await api.v1.historyStorage.set(
      QUEUE_KEY,
      [{ kind: "revise", entityId: "e1" }],
      history.current(),
    );
    triageReturns(h, "");

    await h.runPass();

    // Triage, and nothing else.
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(lorebook.read("lb-ada")?.text).toBe("x");
  });

  it("drains work an earlier pass deferred, even when triage names nothing new", async () => {
    // A queue that only drains on passes where triage speaks would strand a
    // deferred rewrite until the model happened to mention it again.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({ id: "lb-thread", displayName: "The debt", enabled: true });
    const h = harness(
      [entity("e1", "Ada")],
      [thread("The debt", { lorebookEntryId: "lb-thread" })],
    );
    await api.v1.historyStorage.set(
      QUEUE_KEY,
      [{ kind: "retire", threadId: "The debt" }],
      history.current(),
    );
    triageReturns(h, "");

    await h.runPass();

    expect(lorebook.read("lb-thread")?.enabled).toBe(false);
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
  });

  // ─────────────────────── the free condense trigger ───────────────────────

  /** A managed entity whose lorebook entry has sprawled. */
  function bloated(chars: number): string {
    return `Ada\nType: Character\n\n${"She is a locksmith of some skill. ".repeat(Math.ceil(chars / 33))}`;
  }

  /** Triage says nothing, then the model returns a compaction. */
  function triageThenCompaction(h: Harness, body: string): void {
    h.generate
      .mockResolvedValueOnce({
        choices: [{ text: "", index: 0, token_ids: [] }],
      })
      .mockResolvedValue({
        choices: [
          { text: body, index: 0, token_ids: [], finish_reason: "stop" },
        ],
      });
  }

  it("condenses an entry that has outgrown the threshold, without asking triage", async () => {
    // §5.1: an entry's length is measurable in assess, which is free, so the
    // intent is enqueued directly. Triage returns nothing here and the pass
    // still acts.
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 800 });
    const lorebook = installLorebookFake();
    const text = bloated(1600);
    lorebook.seed({ id: "lb-ada", displayName: "Ada", text, enabled: true });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    triageThenCompaction(h, "A locksmith of some skill. ".repeat(30));

    await h.runPass();

    expect(lorebook.read("lb-ada")?.text).toContain(
      "A locksmith of some skill.",
    );
    expect((lorebook.read("lb-ada")?.text ?? "").length).toBeLessThan(
      text.length,
    );
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
  });

  it("offers one entry per pass, so a World full of long entries cannot bury the revises", async () => {
    // The drain affords one entry rewrite per pass (§3.3). Enqueueing every
    // oversized entry at once would leave the next pass's revise queued behind
    // a backlog of maintenance work, in FIFO, for as many passes as there are
    // long entries — the counterweight starving what it is a counterweight to.
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 800 });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-small",
      displayName: "Ada",
      text: bloated(1000),
      enabled: true,
    });
    lorebook.seed({
      id: "lb-large",
      displayName: "Brennan",
      text: bloated(3000),
      enabled: true,
    });
    const h = harness([
      { ...entity("e1", "Ada"), lorebookEntryId: "lb-small" },
      { ...entity("e2", "Brennan"), lorebookEntryId: "lb-large" },
    ]);
    triageThenCompaction(h, "A locksmith of some skill. ".repeat(40));

    await h.runPass();

    // The longest one — the entry costing the most context.
    expect(writesTo(QUEUE_KEY)[0]).toEqual([
      { kind: "condense", entryId: "lb-large" },
    ]);
  });

  it("queues a condense behind what triage named", async () => {
    // Maintenance is safe indefinitely (§3.3: prose does not un-happen), while
    // a revise records something the story just made true. FIFO in the drain
    // then means the revise is the one that gets the pass's rewrite.
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 800 });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: bloated(1600),
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    h.generate.mockResolvedValue({
      choices: [
        { text: "REVISE Ada", index: 0, token_ids: [], finish_reason: "stop" },
      ],
    });

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0]).toEqual([
      { kind: "revise", entityId: "e1", prose: WHOLE_DOCUMENT },
      { kind: "condense", entryId: "lb-ada" },
    ]);
  });

  // ─────────────────────── the free expiry trigger (§4.5) ───────────────────────

  /** A document long enough for a plot thread anchored at 0 to have aged out:
   *  §4.5's ten forgetting windows are 100 paragraphs for a plot. */
  function longDocument(paragraphs: number): void {
    documentOf(
      ...Array.from({ length: paragraphs }, (_, i) => `Paragraph ${i}.`),
    );
  }

  it("retires a thread the story walked away from, without asking triage", async () => {
    // Expiry is measured, not generated: `isThreadExpired` is free, so the
    // retire is enqueued directly. Triage says nothing here and the pass still
    // acts — and retire costs 0 output tokens (§3.3), so it never waits.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({ id: "lb-t1", displayName: "t1", text: "", enabled: true });
    longDocument(120);
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: 0, lorebookEntryId: "lb-t1" })],
    );

    await h.runPass();

    expect(lorebook.read("lb-t1")?.enabled).toBe(false);
    // `abandoned`, not `satisfied`. Both switch the entry off and both are
    // closed to every mechanism, but the World is about to show the writer a
    // reading of a commitment they never resolved — and a check mark there
    // would assert something false about their own story.
    expect(h.store.getState().world.threads[0].status).toBe("abandoned");
  });

  it("leaves a thread the writer made by hand alone, however long the story runs", async () => {
    // The asymmetry §4.5 names: no anchor, no expiry. A defaulted 0 would
    // retire it on the first pass instead.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({ id: "lb-t1", displayName: "t1", text: "", enabled: true });
    longDocument(400);
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: null, lorebookEntryId: "lb-t1" })],
    );

    await h.runPass();

    expect(lorebook.read("lb-t1")?.enabled).toBe(true);
    expect(h.store.getState().world.threads[0].status).toBe("open");
  });

  it("measures against the branch's whole count, not this pass's backlog", async () => {
    // `paragraphCount` counts every section; `backlog` counts only the unread
    // ones. An Engine that has been reading along has a backlog of one and a
    // branch of hundreds, and expiry is a question about the branch — measuring
    // it against the backlog would mean nothing ever ages out of a story the
    // Engine is keeping up with, which is every story it is switched on for.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({ id: "lb-t1", displayName: "t1", text: "", enabled: true });
    longDocument(120);
    await api.v1.historyStorage.set(
      WATERMARK_KEY,
      { sectionId: sectionIdAt(118), offset: "Paragraph 118.".length },
      history.current(),
    );
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: 0, lorebookEntryId: "lb-t1" })],
    );

    await h.runPass();

    expect(lorebook.read("lb-t1")?.enabled).toBe(false);
  });

  it("holds a thread still inside its own patience", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    longDocument(60);
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: 0 })],
    );

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0] ?? []).toEqual([]);
  });

  it("enqueues every expired thread, because a retire costs nothing", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    longDocument(120);
    const h = harness(
      [entity("e1", "Ada")],
      [
        thread("t1", { anchorParagraph: 0 }),
        thread("t2", { anchorParagraph: 0, horizon: "point" }),
        thread("t3", { anchorParagraph: 0, horizon: "arc" }),
      ],
    );

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0]).toEqual([
      { kind: "retire", why: "abandoned", threadId: "t1" },
      { kind: "retire", why: "abandoned", threadId: "t2" },
    ]);
  });

  it("says expired rather than settled in the log", async () => {
    // The one place the distinction is observable: `ThreadStatus` has no third
    // value, so the World will show this thread as satisfied — which an
    // abandoned commitment is not.
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    longDocument(120);
    debugLogging(true);
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: 0 })],
    );

    await h.runPass();

    expect(logged().join("\n")).toContain("expired");
  });

  // ───────────────────── prose-grounded renewal (§4.5) ─────────────────────

  it("renews a thread whose cast the pass just read", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    documentOf("The lock clicked.", "Ada pocketed the letter.");
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { entityIds: ["e1"], anchorParagraph: 0 })],
    );

    await h.runPass();

    expect(h.store.getState().world.threads[0].anchorParagraph).toBe(2);
  });

  it("leaves a thread the prose said nothing about where it was", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    documentOf("The lock clicked.", "Brennan pocketed the letter.");
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { entityIds: ["e1"], anchorParagraph: 0 })],
    );

    await h.runPass();

    expect(h.store.getState().world.threads[0].anchorParagraph).toBe(0);
  });

  it("anchors at the branch's paragraph count, not this pass's backlog", async () => {
    // The same distinction expiry makes: an Engine that has been reading along
    // has a backlog of one and a branch of hundreds. An anchor recorded as the
    // backlog would sit near paragraph 0 forever and expire the thread it just
    // renewed.
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    documentOf(
      ...Array.from({ length: 119 }, (_, i) => `Paragraph ${i}.`),
      "Ada pocketed the letter.",
    );
    await api.v1.historyStorage.set(
      WATERMARK_KEY,
      { sectionId: sectionIdAt(118), offset: "Paragraph 118.".length },
      history.current(),
    );
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { entityIds: ["e1"], anchorParagraph: 0 })],
    );

    await h.runPass();

    expect(h.store.getState().world.threads[0].anchorParagraph).toBe(120);
  });

  it("renewal beats expiry in the same pass", async () => {
    // The whole reason renewal exists. A plot thread anchored at 0 in a
    // 120-paragraph branch is past its ten windows — but the prose the pass
    // just read names its cast, so the story is plainly still carrying it and
    // retiring it would be the opposite of "an end the story quietly
    // abandoned". Renewal dispatches first and expiry reads the moved anchor,
    // so this is the ordering rather than a special case.
    installStoryStorageFake();
    configure({ enabled: true });
    const lorebook = installLorebookFake();
    lorebook.seed({ id: "lb-t1", displayName: "t1", text: "", enabled: true });
    documentOf(
      ...Array.from({ length: 119 }, (_, i) => `Paragraph ${i}.`),
      "Ada pocketed the letter.",
    );
    const h = harness(
      [entity("e1", "Ada")],
      [
        thread("t1", {
          entityIds: ["e1"],
          anchorParagraph: 0,
          lorebookEntryId: "lb-t1",
        }),
      ],
    );

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0] ?? []).toEqual([]);
    expect(lorebook.read("lb-t1")?.enabled).toBe(true);
    expect(h.store.getState().world.threads[0].status).toBe("open");
  });

  it("still expires a thread the prose walked away from while renewing another", async () => {
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    documentOf(
      ...Array.from({ length: 119 }, (_, i) => `Paragraph ${i}.`),
      "Ada pocketed the letter.",
    );
    const h = harness(
      [entity("e1", "Ada"), entity("e2", "Brennan")],
      [
        thread("alive", { entityIds: ["e1"], anchorParagraph: 0 }),
        thread("gone", { entityIds: ["e2"], anchorParagraph: 0 }),
      ],
    );

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0]).toEqual([
      { kind: "retire", why: "abandoned", threadId: "gone" },
    ]);
  });

  it("does not re-enqueue a thread it already retired", async () => {
    // `isThreadExpired` never expires a satisfied thread, so the trigger is
    // self-clearing — no mark of the kind the condense trigger needs.
    installStoryStorageFake();
    configure({ enabled: true });
    installLorebookFake();
    longDocument(120);
    const h = harness(
      [entity("e1", "Ada")],
      [thread("t1", { anchorParagraph: 0, status: "satisfied" })],
    );

    await h.runPass();

    expect(writesTo(QUEUE_KEY)[0] ?? []).toEqual([]);
  });

  it("leaves a long entry no entity of ours is bound to alone", async () => {
    // The Engine condenses what it manages. A lorebook the writer keeps by hand
    // is not sprawl the Engine created, and rewriting it is not something they
    // asked for by switching the loop on.
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 800 });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-theirs",
      displayName: "The Guild",
      text: bloated(4000),
      enabled: true,
    });
    const h = harness([entity("e1", "Ada")]);
    triageReturns(h, "");

    await h.runPass();

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("leaves a disabled entry alone, because it is costing no context", async () => {
    // A retired thread's entry, or one the writer switched off: it injects
    // nothing, so compacting it is a lossy rewrite with nothing to gain.
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 800 });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: bloated(4000),
      enabled: false,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    triageReturns(h, "");

    await h.runPass();

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("reads the threshold from the setting, not from a constant", async () => {
    installStoryStorageFake();
    configure({ enabled: true, condenseAtChars: 4000 });
    const lorebook = installLorebookFake();
    lorebook.seed({
      id: "lb-ada",
      displayName: "Ada",
      text: bloated(1600),
      enabled: true,
    });
    const h = harness([{ ...entity("e1", "Ada"), lorebookEntryId: "lb-ada" }]);
    triageReturns(h, "");

    await h.runPass();

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
  });

  it("mirrors the machine into the store for the HUD to read", async () => {
    const h = harness();
    triageReturns(h, "REVISE Ada");
    await h.runPass();

    // backlog 0, not 2: the pass READ those two paragraphs. The slot means
    // "unread", and a wakeup only fires after a generation — so a backlog that
    // merely carried forward would never once read 0 in normal use, and the
    // writer could not tell "kept up" from "two behind".
    expect(h.store.getState().engine).toMatchObject({
      phase: "idle",
      backlog: 0,
      queued: 0,
      consecutiveFailures: 0,
    });
  });

  it("leaves the backlog standing when the pass did not read it", async () => {
    // A refused pass read nothing, so the paragraphs are still unread and the
    // climb is exactly the signal §9.1 wants against the budget slot.
    const h = harness();
    triageRejects(h, REFUSAL);
    await h.runPass();

    expect(h.store.getState().engine.backlog).toBe(2);
  });

  it("writes the watermark and the queue as two separate records", async () => {
    // historyStorage is copy-on-write per key per node: one blob would snapshot
    // the queue onto every node the watermark touches.
    const h = harness();
    triageReturns(h, "REVISE Ada");
    await h.runPass();

    const keys = vi
      .mocked(api.v1.historyStorage.set)
      .mock.calls.map((c) => c[0]);
    expect(new Set(keys)).toEqual(new Set([WATERMARK_KEY, QUEUE_KEY]));
    for (const [, value] of vi.mocked(api.v1.historyStorage.set).mock.calls) {
      expect(value).not.toHaveProperty("watermark");
      expect(value).not.toHaveProperty("queue");
    }
  });

  it("stamps every write with the node it captured when the pass began", async () => {
    // §6.3: the writer keeps typing while triage runs, and a set() without an
    // explicit node has been measured landing two nodes away.
    const started = history.current();
    const h = harness();
    triageReturns(h, "REVISE Ada");
    const pass = h.runPass();
    history.push(); // the writer commits another paragraph mid-pass
    await pass;

    for (const call of vi.mocked(api.v1.historyStorage.set).mock.calls) {
      expect(call[2]).toBe(started);
    }
  });

  it("shows triage only the candidates and the story's threads", async () => {
    // Not every live entity: assess is generous, and a manifest of the whole
    // World would cost input tokens on every pass forever.
    const h = harness([entity("e1", "Ada"), entity("e2", "Brennan")]);
    triageReturns(h, "");
    await h.runPass();

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const text = (await factory()).messages
      .map((m) => m.content ?? "")
      .join("\n");
    expect(text).toContain("Ada");
    expect(text).not.toContain("Brennan");
  });

  it("shows triage the cap, each thread's horizon, and what an OPEN costs", async () => {
    // §4.5: triage cannot justify a new thread against a ceiling it was never
    // told about, and it must not be left inventing its own answer to which
    // thread a create would take.
    configure({ enabled: true, threadCap: 2 });
    const h = harness(
      [entity("e1", "Ada")],
      [thread("Older debt", { horizon: "arc" }), thread("A dropped glove")],
    );
    triageReturns(h, "");
    await h.runPass();

    const factory = h.generate.mock.calls[0][0] as () => Promise<{
      messages: Message[];
    }>;
    const block = (await factory()).messages
      .map((m) => m.content ?? "")
      .find((c) => c.startsWith("=== THREADS"));
    expect(block).toContain("=== THREADS (2 of 2) ===");
    expect(block).toContain("- Older debt [arc]:");
    expect(block).toContain("- A dropped glove [plot]:");
    expect(block).toContain(
      "The list is full. Opening another displaces: A dropped glove",
    );
  });

  // ──────────────────────── nothing new to look at ────────────────────────

  it("ends at assess without generating when there is nothing new", async () => {
    const h = harness();
    triageReturns(h, "");
    await h.runPass();
    h.generate.mockClear();

    await h.runPass();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().engine).toMatchObject({
      phase: "idle",
      backlog: 0,
    });
  });

  // ─────────────────────────── the prose threshold ────────────────────────

  it("skips the pass below the minimum without lying about the backlog", async () => {
    // The shortcut this rules out is dispatching `assessed { backlog: 0 }`: it
    // terminates correctly and tells the HUD there is nothing to read when
    // there are two unread paragraphs — the exact number §9.1 wants weighed
    // against the budget.
    configure({ enabled: true, minProse: 4 });
    const h = harness();
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().engine.backlog).toBe(2);
    expect(h.store.getState().engine.phase).toBe("idle");
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBeUndefined();
  });

  it("runs the pass once the backlog reaches the threshold", async () => {
    configure({ enabled: true, minProse: 2 });
    const h = harness();
    triageReturns(h, "");
    await h.runPass();
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────── the budget ──────────────────────────────

  it("holds without generating when the budget cannot cover triage", async () => {
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(50);
    const h = harness();
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().engine.phase).toBe("held");
    // A hold is not a completed pass: the prose stays unread.
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBeUndefined();
    // ...and the HUD still gets the real backlog to weigh against it.
    expect(h.store.getState().engine.backlog).toBe(2);
  });

  it("starts again from held once the budget recovers", async () => {
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(50);
    const h = harness();
    triageReturns(h, "");
    await h.runPass();
    expect(h.store.getState().engine.phase).toBe("held");

    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(2048);
    await h.runPass();
    expect(h.store.getState().engine.phase).toBe("idle");
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toEqual({
      sectionId: sectionIdAt(1),
      offset: "Ada pocketed the letter.".length,
    });
  });

  // ───────────────────────── refusal and failure ──────────────────────────

  it("leaves the watermark and the queue untouched when triage is refused", async () => {
    const h = harness();
    triageRejects(h, REFUSAL);

    await h.runPass();

    expect(vi.mocked(api.v1.historyStorage.set)).not.toHaveBeenCalled();
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBeUndefined();
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toBeUndefined();
  });

  it("retries a refusal a bounded number of times, counting from one", async () => {
    // backoffMs(0) is null, so a loop written `for (attempt = 0; ...)` performs
    // no retries at all rather than failing loudly.
    const h = harness();
    triageRejects(h, REFUSAL);

    await h.runPass();

    expect(h.generate).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("takes retryable from the classifier, so a collision is not a stall", async () => {
    const h = harness();
    triageRejects(h, REFUSAL);

    await h.runPass();

    expect(h.store.getState().engine.phase).toBe("idle");
    expect(h.store.getState().engine.consecutiveFailures).toBe(0);
  });

  it("counts an unrecognised failure, and does not retry it", async () => {
    const h = harness();
    triageRejects(h, new Error("400 Bad Request"));

    await h.runPass();

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.store.getState().engine.consecutiveFailures).toBe(1);
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("stalls only after a run of real failures, and recovers on the next pass", async () => {
    const h = harness();
    triageRejects(h, new Error("400 Bad Request"));
    for (let i = 0; i < 4; i++) await h.runPass();
    expect(h.store.getState().engine.phase).toBe("stalled");

    triageReturns(h, "");
    await h.runPass();
    expect(h.store.getState().engine.phase).toBe("idle");
    expect(h.store.getState().engine.consecutiveFailures).toBe(0);
  });

  it("releases the guard when a pass fails, rather than waking once a session", async () => {
    const h = harness();
    triageRejects(h, new Error("400 Bad Request"));
    await h.runPass();

    triageReturns(h, "");
    await h.runPass();
    expect(h.generate).toHaveBeenCalledTimes(2);
  });

  // ────────────────────────────── re-entry ────────────────────────────────

  it("ignores a second pass request while one is running", async () => {
    // The ⚡ is not idempotent and a wasted pass costs real budget. `disabled`
    // is a render-time value and cannot carry this.
    const h = harness();
    let release: (value: { choices: { text: string }[] }) => void = () => {};
    h.generate.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    const first = h.runPass();
    const second = h.runPass();
    await second;
    await vi.waitFor(() => expect(h.generate).toHaveBeenCalled());

    release({ choices: [{ text: "" }] });
    await first;
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────── the ⚡ ─────────────────────────────────

  it("runs a pass when the HUD asks for one", async () => {
    const h = harness();
    triageReturns(h, "");
    registerEngineLoopEffects(h.deps);

    h.store.dispatch(enginePassRequested());

    await vi.waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
  });

  // ───────────────────────────── the off switch ───────────────────────────
  //
  // `enabled` is the one setting that stops the Engine spending output
  // budget, so it is checked in exactly ONE place — inside the pass, which every
  // entry point goes through. Checking it at each entry point instead is how a
  // path gets missed: the wakeup's own check happens when the timer is ARMED,
  // and the writer has the whole delay window to change their mind.

  it("spends nothing when the Engine is switched off", async () => {
    configure({ enabled: false });
    const h = harness();
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    expect(h.generate).not.toHaveBeenCalled();
    expect(vi.mocked(api.v1.historyStorage.set)).not.toHaveBeenCalled();
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("tells the HUD the Engine is off, from the pass that refused", async () => {
    configure({ enabled: false });
    const h = harness();
    h.store.dispatch(
      engineSettingsChanged({ ...ENGINE_DEFAULTS, enabled: true }),
    );

    await h.runPass();

    expect(h.store.getState().engine.settings.enabled).toBe(false);
  });

  it("mirrors the stored settings into the store at startup", async () => {
    // Without this the slice's defaults stand until the writer generates or
    // presses ⚡ — so someone who opted in opens their story and reads "Off —
    // the Engine is not running", a glyph and a tooltip asserting a fact that is
    // not true. The WHOLE record, not just `enabled`: the Setup form renders
    // from this, and nothing else ever dispatches the other fields.
    configure({
      enabled: true,
      delayMs: 3000,
      minProse: 4,
      threadCap: 3,
      condenseAtChars: 1600,
    });
    const h = harness();

    registerEngineLoopEffects(h.deps);
    await settle();

    expect(h.store.getState().engine.settings).toEqual({
      enabled: true,
      delayMs: 3000,
      minProse: 4,
      threadCap: 3,
      condenseAtChars: 1600,
    });
  });

  it("refuses the ⚡ while the Engine is off", async () => {
    configure({ enabled: false });
    const h = harness();
    triageReturns(h, "REVISE Ada");
    registerEngineLoopEffects(h.deps);

    h.store.dispatch(enginePassRequested());
    await settle();

    expect(h.generate).not.toHaveBeenCalled();
  });

  it("refuses a wakeup switched off inside its own delay window", async () => {
    // Armed while the Engine was on, fired after the writer turned it off. The
    // arming check cannot cover this — 8 seconds is plenty of time to change
    // your mind, and the callback runs on the far side of it.
    const h = harness();
    triageReturns(h, "REVISE Ada");
    const fire = await armWakeup(h);

    configure({ enabled: false });
    await fire();

    expect(h.generate).not.toHaveBeenCalled();
  });

  it("still runs a wakeup that is left switched on", async () => {
    const h = harness();
    triageReturns(h, "");
    const fire = await armWakeup(h);

    await fire();

    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  // ───────────────────── the log, behind story_engine_debug ─────────────────────
  //
  // §9.1's HUD is the always-on surface and these lines are the detail behind
  // it. With the flag off the Engine is silent — no new logging surface was
  // added and no new config entry either; the one that already exists is what
  // opens it. Every assertion below is about the SAME pass doing the same work,
  // so a gate that also gated the work would fail here rather than pass quietly.

  describe("its log", () => {
    it("says nothing at all with the flag off", async () => {
      debugLogging(false);
      const h = harness();
      triageReturns(h, "REVISE Ada\nOPEN the sealed letter");

      await h.runPass();

      expect(api.v1.log).not.toHaveBeenCalled();
      // …and the pass did everything it does. The flag gates the account of the
      // work, never the work.
      expect(writesTo(QUEUE_KEY)).toEqual([
        [
          { kind: "revise", entityId: "e1", prose: WHOLE_DOCUMENT },
          { kind: "open", subject: "the sealed letter", prose: WHOLE_DOCUMENT },
        ],
        [],
      ]);
    });

    it("names every intent with the flag on", async () => {
      debugLogging(true);
      const h = harness();
      triageReturns(h, "REVISE Ada\nOPEN the sealed letter");

      await h.runPass();

      // The revise reaches its arm and finds a draft entity with no entry to
      // rewrite; the open reaches its own and opens a thread.
      expect(logged()).toContain(
        "[engine] revise Ada: no lorebook entry, skipped",
      );
      expect(logged()).toContain("[engine] executed open:the sealed letter");
    });

    it("gates the skip line too, not only the drain", async () => {
      // The five callsites are one gate, not one gate and four survivors. This
      // is the pass that spends nothing: two new paragraphs under a minimum of
      // five.
      configure({ enabled: true, minProse: 5 });
      debugLogging(false);
      await harness().runPass();
      expect(api.v1.log).not.toHaveBeenCalled();

      debugLogging(true);
      await harness().runPass();
      expect(logged()).toContain(
        "[engine] 2 new paragraph(s), below the minimum of 5 — skipping",
      );
    });

    it("gates the budget hold too", async () => {
      vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(10);

      debugLogging(false);
      await harness().runPass();
      expect(api.v1.log).not.toHaveBeenCalled();

      debugLogging(true);
      await harness().runPass();
      expect(logged()).toContain(
        "[engine] holding — budget below the triage reserve",
      );
    });

    it("gates the failure line, which is the one that reports ⚠", async () => {
      debugLogging(false);
      const quiet = harness();
      triageRejects(quiet, new Error("nope"));
      await quiet.runPass();
      expect(api.v1.log).not.toHaveBeenCalled();
      // The HUD still hears about it: the machine is mirrored into the store
      // whatever the log is doing.
      expect(quiet.store.getState().engine.phase).toBe("idle");
      expect(quiet.store.getState().engine.consecutiveFailures).toBe(1);

      debugLogging(true);
      const loud = harness();
      triageRejects(loud, new Error("nope"));
      await loud.runPass();
      expect(logged()).toContain("[engine] pass failed (retryable=false):");
    });

    it("reads the flag once, where the pass is built", async () => {
      // Not once per line and not once per pass: `api.v1.config` is read-only
      // and a `project.yaml` entry cannot change mid-session, so five reads a
      // pass would ask the same question and get the same answer.
      // TWO intents, so the pass emits two lines, and TWO passes: one read for
      // five lines is the claim, and a flag read per line or per pass both show
      // up as more than one read here. A single-intent pass would pass this
      // test against a per-line read — verified, which is why it names two.
      debugLogging(true);
      const h = harness();
      triageReturns(h, "REVISE Ada\nOPEN the sealed letter");

      await h.runPass();
      await h.runPass();

      expect(logged().length).toBe(2);
      const reads = vi
        .mocked(api.v1.config.get)
        .mock.calls.filter((c) => c[0] === "story_engine_debug");
      expect(reads.length).toBe(1);
    });
  });

  describe("GenX declines rather than parking (§3.5)", () => {
    /** GenX 0.5.0's rejection, by shape — the bundle inlines GenX, so nothing may
     *  depend on the prototype. */
    const rejected = (reason: string) => ({
      isFastRejection: true,
      reason,
      name: "FastRejectionError",
      message: `rejected: ${reason}`,
    });

    it("reads a budget rejection as held, not as a failure", async () => {
      // ⏸ says "the budget cannot cover the next step", which is exactly what
      // happened. ⚠ says something is wrong. Reporting a routine hold as a
      // failure would put a warning on the always-on surface every time the
      // writer ran SEGA — the outcome §9.1 forbids.
      const h = harness();
      triageRejects(h, rejected("budget"));

      await h.runPass();

      expect(h.store.getState().engine.phase).toBe("held");
      expect(h.store.getState().engine.consecutiveFailures).toBe(0);
    });

    it("counts a busy rejection as the collision it is, not toward a stall", async () => {
      // GenX refuses before the call goes out; the backend refuses after. One
      // event, and neither may march the loop toward `stalled`.
      const h = harness();
      triageRejects(h, rejected("busy"));

      await h.runPass();

      expect(h.store.getState().engine.consecutiveFailures).toBe(0);
    });

    it("still stalls on something genuinely wrong", async () => {
      // The counter has to survive: a hold that spared everything would remove
      // the only signal §3.4 has that the loop is broken.
      const h = harness();
      triageRejects(h, new Error("the lorebook exploded"));

      await h.runPass();

      expect(h.store.getState().engine.consecutiveFailures).toBe(1);
    });
  });
});

describe("the trigger's other job", () => {
  beforeEach(() => {
    vi.mocked(api.v1.hooks.register).mockClear();
    configure({ enabled: false });
  });

  afterEach(() => {
    vi.mocked(api.v1.storyStorage.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
  });

  it("forwards a user generation to GenX, whose own hook this one replaced", async () => {
    // api.v1.hooks.register holds one callback per hook name, and GenX
    // registers this hook in its constructor to unpark a task waiting on the
    // budget. Registering ours silently took that over.
    const h = harness();
    registerEngineLoopEffects(h.deps);
    const hook = vi
      .mocked(api.v1.hooks.register)
      .mock.calls.filter((c) => c[0] === "onGenerationRequested")
      .pop()?.[1] as (p: {
      continuityId: string;
      model: string;
      scriptInitiated: boolean;
    }) => Promise<void>;

    await hook({ continuityId: "c1", model: "glm-4-6", scriptInitiated: true });
    expect(h.userInteraction).not.toHaveBeenCalled();

    await hook({
      continuityId: "c1",
      model: "glm-4-6",
      scriptInitiated: false,
    });
    expect(h.userInteraction).toHaveBeenCalledTimes(1);
  });
});
