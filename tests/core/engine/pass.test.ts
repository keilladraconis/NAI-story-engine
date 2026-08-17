import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  createEnginePass,
  enginePassRequested,
  registerEngineLoopEffects,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import { rootReducer } from "../../../src/core/store";
import type { RootState, WorldEntity } from "../../../src/core/store/types";
import { persistedDataLoaded } from "../../../src/core/store";
import { initialWorldState } from "../../../src/core/store/slices/world";
import { QUEUE_KEY, WATERMARK_KEY } from "../../../src/core/engine/intents";
import { MAX_ATTEMPTS } from "../../../src/core/engine/refusal";
import {
  installHistoryFake,
  type HistoryFake,
} from "../../helpers/history-fake";

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

function harness(entities: WorldEntity[] = [entity("e1", "Ada")]): Harness {
  const store = createStore<RootState>(rootReducer);
  store.dispatch(
    persistedDataLoaded({
      world: {
        ...initialWorldState,
        entityIds: entities.map((e) => e.id),
        entitiesById: Object.fromEntries(entities.map((e) => [e.id, e])),
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

function configure(values: Record<string, unknown>): void {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key in values ? values[key] : undefined,
  );
}

/** Every value written to a record key, oldest first. */
function writesTo(key: string): unknown[] {
  return vi
    .mocked(api.v1.historyStorage.set)
    .mock.calls.filter((c) => c[0] === key)
    .map((c) => c[1]);
}

let history: HistoryFake;

describe("the pass", () => {
  beforeEach(() => {
    history = installHistoryFake();
    configure({ engine_enabled: true });
    documentOf("The lock clicked.", "Ada pocketed the letter.");
    vi.mocked(api.v1.log).mockClear();
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(2048);
    // The bounded backoff is tested by its call count, not by wall clock.
    vi.mocked(api.v1.timers.sleep).mockResolvedValue(undefined);
  });

  afterEach(() => {
    history.reset();
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
  });

  // ─────────────────────────── a completed pass ───────────────────────────

  it("advances the watermark to the last section it read", async () => {
    const h = harness();
    triageReturns(h, "REVISE Ada");
    await h.runPass();

    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBe(sectionIdAt(1));
  });

  it("advances the watermark even when triage names nothing", async () => {
    // The common case on quiet prose. A watermark that only moved when there
    // was work to do would re-read the same paragraphs on every pass forever.
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBe(sectionIdAt(1));
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("reads only what is past the watermark on the next pass", async () => {
    const h = harness();
    triageReturns(h, "");
    await h.runPass();

    documentOf("The lock clicked.", "Ada pocketed the letter.", "Rain again.");
    await h.runPass();

    expect(h.store.getState().engine.backlog).toBe(1);
  });

  it("enqueues what triage named, logs it, and clears the queue", async () => {
    // Drain LOGS in this phase. Nothing writes a lorebook entry, creates a
    // group or retires anything — and the queue is cleared rather than held,
    // because nothing will ever come back for it.
    const h = harness();
    triageReturns(h, "REVISE Ada\nOPEN the sealed letter");
    await h.runPass();

    expect(writesTo(QUEUE_KEY)).toEqual([
      [
        { kind: "revise", entityId: "e1" },
        { kind: "open", subject: "the sealed letter" },
      ],
      [],
    ]);
    const logged = vi.mocked(api.v1.log).mock.calls.map((c) => String(c[0]));
    expect(logged).toContain("[engine] intent (not executed): revise:e1");
    expect(logged).toContain(
      "[engine] intent (not executed): open:the sealed letter",
    );
    expect(await api.v1.historyStorage.get(QUEUE_KEY)).toEqual([]);
    expect(api.v1.lorebook.updateEntry).not.toHaveBeenCalled();
    expect(api.v1.lorebook.createEntry).not.toHaveBeenCalled();
  });

  it("mirrors the machine into the store for the HUD to read", async () => {
    const h = harness();
    triageReturns(h, "REVISE Ada");
    await h.runPass();

    expect(h.store.getState().engine).toMatchObject({
      phase: "idle",
      backlog: 2,
      queued: 0,
      consecutiveFailures: 0,
    });
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

  it("skips the pass below engine_min_prose without lying about the backlog", async () => {
    // The shortcut this rules out is dispatching `assessed { backlog: 0 }`: it
    // terminates correctly and tells the HUD there is nothing to read when
    // there are two unread paragraphs — the exact number §9.1 wants weighed
    // against the budget.
    configure({ engine_enabled: true, engine_min_prose: 4 });
    const h = harness();
    triageReturns(h, "REVISE Ada");

    await h.runPass();

    expect(h.generate).not.toHaveBeenCalled();
    expect(h.store.getState().engine.backlog).toBe(2);
    expect(h.store.getState().engine.phase).toBe("idle");
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBeUndefined();
  });

  it("runs the pass once the backlog reaches the threshold", async () => {
    configure({ engine_enabled: true, engine_min_prose: 2 });
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
    expect(await api.v1.historyStorage.get(WATERMARK_KEY)).toBe(sectionIdAt(1));
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
});

describe("the trigger's other job", () => {
  beforeEach(() => {
    vi.mocked(api.v1.hooks.register).mockClear();
    configure({ engine_enabled: false });
  });

  afterEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
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
