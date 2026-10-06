// The review step inside the pass: when it runs, what it spends against, and
// what it leaves alone when it cannot run. The model is one fake that answers by
// which system prompt it is shown, so the tests read as a conversation between
// the pass and a reviewer.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStore, type Store } from "nai-store";
import {
  createEnginePass,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import { rootReducer, persistedDataLoaded } from "../../../src/core/store";
import type {
  RootState,
  Thread,
  WorldEntity,
} from "../../../src/core/store/types";
import { initialWorldState } from "../../../src/core/store/slices/world";
import {
  ENGINE_LOOP_KEY,
  type EngineRecord,
} from "../../../src/core/engine/intents";
import {
  ENGINE_DEFAULTS,
  type EngineSettings,
} from "../../../src/core/engine/settings";
import { STORAGE_KEYS } from "../../../src/core/keys";
import {
  REVIEW_SYSTEM,
  TRIAGE_SYSTEM,
  THREAD_WRITE_SYSTEM,
} from "../../../src/core/utils/prompts";
import { registerThreadConditionEffects } from "../../../src/core/engine/thread-bind";
import {
  installLorebookFake,
  type LorebookFake,
} from "../../helpers/lorebook-fake";
import {
  installStoryStorageFake,
  type StoryStorageFake,
} from "../../helpers/story-storage-fake";

let story: StoryStorageFake;
let lorebook: LorebookFake;

beforeEach(() => {
  story = installStoryStorageFake();
  lorebook = installLorebookFake();
  vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(10000);
});

function documentOf(...texts: string[]): void {
  const scanned = texts.map((text, index) => ({
    sectionId: 500 + index,
    section: { text, origin: [], formatting: [] } as Section,
    index,
  }));
  api.v1.document.scan = vi.fn(async () => scanned);
}

function settings(over: Partial<EngineSettings>): void {
  story.set(STORAGE_KEYS.ENGINE_SETTINGS, {
    ...ENGINE_DEFAULTS,
    enabled: true,
    ...over,
  });
}

const record = () => story.get(ENGINE_LOOP_KEY) as EngineRecord;

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "draft",
    name,
    summary: "",
  };
}

type Reply = { triage?: string; review?: string; write?: string };

/** One fake model answering by which prompt it was shown. */
function harness(threads: Thread[], reply: Reply) {
  const store: Store<RootState> = createStore<RootState>(rootReducer);
  const entities = [entity("a", "Ines"), entity("c", "The Cooperative")];
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
  registerThreadConditionEffects(
    store.subscribeEffect,
    store.getState,
    store.dispatch,
  );

  const seen: string[] = [];
  const generate = vi.fn(
    async (factory: () => Promise<{ messages: Message[] }>) => {
      const system = (await factory()).messages[0].content ?? "";
      const which =
        system === TRIAGE_SYSTEM
          ? "triage"
          : system === REVIEW_SYSTEM
            ? "review"
            : system === THREAD_WRITE_SYSTEM
              ? "write"
              : "other";
      seen.push(which);
      const text = which === "other" ? "" : (reply[which as keyof Reply] ?? "");
      return {
        choices: [{ text, index: 0, token_ids: [], finish_reason: "stop" }],
      };
    },
  );
  const deps: EngineLoopDeps = {
    subscribeEffect: store.subscribeEffect,
    dispatch: store.dispatch,
    getState: store.getState,
    genX: {
      generate,
      userInteraction: vi.fn(),
    } as unknown as EngineLoopDeps["genX"],
  };
  return { store, generate, seen, runPass: createEnginePass(deps) };
}

const SCENE = [
  "Ines counted frames.",
  "The Cooperative sent a letter to Ines.",
  "Ines read it twice.",
  "The Cooperative wanted the east hives.",
  "Ines told the Cooperative no.",
];
const ADMIT = "ADMIT The East Hives | Ines, The Cooperative";
const WRITE =
  "MOVED: The Cooperative asked for the hives.\nLATENT: none\nSTATE: Ines keeps the east hives against the Cooperative's claim.";

describe("the review step", () => {
  it("does not run until enough prose is unread", async () => {
    settings({ reviewEvery: 25 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).toEqual(["triage"]);
    expect(record().reviewWatermark).toBeNull();
    expect(h.store.getState().engine.reviewBacklog).toBe(5);
  });

  it("runs after triage once the threshold is met, and admits a Thread through the drain", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).toEqual(["triage", "review", "write"]);
    expect(h.store.getState().world.threads[0]).toMatchObject({
      title: "The East Hives",
      entityIds: ["a", "c"],
      state: "Ines keeps the east hives against the Cooperative's claim.",
    });
    expect(record().reviewWatermark).toEqual({
      sectionId: 504,
      offset: SCENE[4].length,
    });
    expect(h.store.getState().engine.reviewBacklog).toBe(0);
  });

  it("runs on demand below the threshold", async () => {
    settings({ reviewEvery: 25 });
    documentOf(...SCENE);
    const h = harness([], { review: "" });

    await h.runPass({ forceReview: true });

    expect(h.seen).toContain("review");
  });

  it("runs with nothing new for triage, when a review is still owed", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    story.set(ENGINE_LOOP_KEY, {
      watermark: { sectionId: 504, offset: SCENE[4].length },
      reviewWatermark: null,
      queue: [],
    });
    const h = harness([], { review: "" });

    await h.runPass();

    expect(h.seen).toEqual(["review"]);
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("leaves the review watermark alone when the budget cannot cover the call", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT });
    vi.mocked(api.v1.script.getAllowedOutput).mockReturnValue(500);

    await h.runPass();

    expect(h.seen).toEqual(["triage"]);
    expect(record().reviewWatermark).toBeNull();
    expect(record().watermark).not.toBeNull();
  });

  it("leaves the review watermark alone when the call collides with the writer, and keeps triage's work", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    const h = harness([], {});
    h.generate.mockImplementation(
      async (factory: () => Promise<{ messages: Message[] }>) => {
        const system = (await factory()).messages[0].content ?? "";
        if (system === REVIEW_SYSTEM)
          throw new Error("A generation is already in progress");
        return {
          choices: [
            { text: "", index: 0, token_ids: [], finish_reason: "stop" },
          ],
        };
      },
    );

    await h.runPass();

    expect(record().reviewWatermark).toBeNull();
    expect(record().watermark).toEqual({
      sectionId: 504,
      offset: SCENE[4].length,
    });
    expect(h.store.getState().engine.phase).toBe("idle");
  });

  it("re-syncs open Thread entries before it reads, so edited keys are followed", async () => {
    settings({ reviewEvery: 5 });
    documentOf(...SCENE);
    lorebook.seed({
      id: "la",
      displayName: "Ines",
      keys: ["ines"],
      text: "",
    } as LorebookEntry);
    const thread: Thread = {
      id: "t1",
      title: "T",
      state: "S.",
      latent: "",
      entityIds: ["a"],
      status: "open",
      lorebookEntryId: "lt",
    };
    lorebook.seed({
      id: "lt",
      displayName: "T",
      text: "S.",
      enabled: true,
      keys: [],
    } as LorebookEntry);
    const h = harness([thread], { review: "" });
    const live = h.store.getState().world.entitiesById.a;
    h.store.dispatch(
      persistedDataLoaded({
        world: {
          ...h.store.getState().world,
          entitiesById: {
            ...h.store.getState().world.entitiesById,
            a: { ...live, lifecycle: "live", lorebookEntryId: "la" },
          },
        },
      }),
    );
    lorebook.seed({
      id: "la",
      displayName: "Ines",
      keys: ["ines", "the beekeeper"],
      text: "",
    } as LorebookEntry);

    await h.runPass();

    expect(JSON.stringify(lorebook.read("lt")?.advancedConditions)).toContain(
      "the beekeeper",
    );
  });

  it("logs nothing to the World when a floor refuses the admission", async () => {
    settings({ reviewEvery: 5 });
    documentOf(
      "Ines counted frames.",
      "A glass stood on the table.",
      "x",
      "y",
      "z",
    );
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).not.toContain("write");
    expect(h.store.getState().world.threads).toEqual([]);
  });
  it("keeps reading window after window while the unread prose does not fit one", async () => {
    // Five paragraphs of 7000 characters: one to a window, so the unread count
    // falls 5 -> 4 -> 3 on successive passes and a trigger that only watched
    // `reviewEvery` would stop at four and trail the story for good.
    settings({ reviewEvery: 5 });
    const long = (n: number) => `Ines counted frame ${n}. `.repeat(300);
    documentOf(long(1), long(2), long(3), long(4), long(5));
    // From a watermark the document still holds: a story never reviewed starts
    // at its latest scene instead (the next test).
    story.set(ENGINE_LOOP_KEY, {
      watermark: null,
      reviewWatermark: { sectionId: 500, offset: 0 },
      queue: [],
    });
    const h = harness([], { review: "" });

    await h.runPass();
    expect(h.seen.filter((x) => x === "review")).toHaveLength(1);
    expect(record().reviewWatermark?.sectionId).toBe(500);
    expect(h.store.getState().engine.reviewBacklog).toBe(4);

    await h.runPass();
    expect(h.seen.filter((x) => x === "review")).toHaveLength(2);
    expect(record().reviewWatermark?.sectionId).toBe(501);
    expect(h.store.getState().engine.reviewBacklog).toBe(3);

    await h.runPass();
    await h.runPass();
    // The last paragraph fits a window and is under the threshold: it waits for
    // the ordinary trigger rather than being read alone.
    expect(h.seen.filter((x) => x === "review")).toHaveLength(4);
    expect(record().reviewWatermark?.sectionId).toBe(503);
    expect(h.store.getState().engine.reviewBacklog).toBe(1);
  });

  it("reviews a long story it has never reviewed once, from its latest scene", async () => {
    // Forty paragraphs of about a thousand characters: several windows. Read
    // head-first, catching up would spend a review on every pass and judge
    // today's Threads by chapter one.
    settings({ reviewEvery: 5 });
    const paragraphs = Array.from({ length: 40 }, (_, n) =>
      `Ines counted frame ${n}. `.repeat(40),
    );
    documentOf(...paragraphs);
    story.set(ENGINE_LOOP_KEY, {
      watermark: null,
      reviewWatermark: null,
      queue: [],
    });
    const h = harness([], { review: "" });

    await h.runPass();
    await h.runPass();

    expect(h.seen.filter((x) => x === "review")).toHaveLength(1);
    expect(record().reviewWatermark).toEqual({
      sectionId: 539,
      offset: paragraphs[39].length,
    });
    expect(h.store.getState().engine.reviewBacklog).toBe(0);
  });

  describe("a story with no review watermark, in ordinary 600-character paragraphs", () => {
    // Twenty of these fill one window exactly, and the default threshold is
    // twenty-five — so a count of the window alone could never reach it.
    const paragraph = (n: number): string =>
      `Ines counted frame ${n} again. `.repeat(30).slice(0, 599) + ".";
    const story600 = (count: number): string[] =>
      Array.from({ length: count }, (_, n) => paragraph(n));
    const reviews = (h: { seen: string[] }): number =>
      h.seen.filter((x) => x === "review").length;

    it("gets its first review by itself, as soon as it outgrows one window", async () => {
      settings({ reviewEvery: ENGINE_DEFAULTS.reviewEvery });
      expect(ENGINE_DEFAULTS.reviewEvery).toBe(25);
      const h = harness([], { review: "" });

      let firstReviewAt = 0;
      for (let size = 1; size <= 30 && firstReviewAt === 0; size++) {
        documentOf(...story600(size));
        await h.runPass();
        if (reviews(h) > 0) firstReviewAt = size;
      }

      // Twenty fit the window; the twenty-first is the first that does not,
      // which comes before the threshold of twenty-five.
      expect(firstReviewAt).toBe(21);
      expect(record().reviewWatermark).toEqual({
        sectionId: 520,
        offset: 600,
      });
      expect(h.store.getState().engine.reviewBacklog).toBe(0);
    });

    it("reviews a 400-paragraph story once, and then owes nothing", async () => {
      settings({ reviewEvery: ENGINE_DEFAULTS.reviewEvery });
      documentOf(...story600(400));
      story.set(ENGINE_LOOP_KEY, {
        watermark: null,
        reviewWatermark: null,
        queue: [],
      });
      const h = harness([], { review: "" });

      await h.runPass();
      await h.runPass();
      await h.runPass();

      expect(reviews(h)).toBe(1);
      expect(record().reviewWatermark).toEqual({
        sectionId: 899,
        offset: 600,
      });
      expect(h.store.getState().engine.reviewBacklog).toBe(0);
    });
  });

  it("reports the real untriaged backlog when triage waits on minProse and the review runs", async () => {
    settings({ reviewEvery: 5, minProse: 10 });
    documentOf(...SCENE);
    const h = harness([], { review: "" });

    await h.runPass();

    expect(h.seen).toEqual(["review"]);
    expect(record().watermark).toBeNull();
    expect(h.store.getState().engine.backlog).toBe(5);
  });

  it("keeps that backlog through a drain the review fed", async () => {
    settings({ reviewEvery: 5, minProse: 10 });
    documentOf(...SCENE);
    const h = harness([], { review: ADMIT, write: WRITE });

    await h.runPass();

    expect(h.seen).toEqual(["review", "write"]);
    expect(record().watermark).toBeNull();
    expect(h.store.getState().engine.backlog).toBe(5);
  });
});
