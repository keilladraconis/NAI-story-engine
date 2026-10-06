import { describe, it, expect } from "vitest";
import {
  ADMIT_MIN_PARAGRAPHS,
  applyFloors,
  buildReviewManifest,
  createReviewFactory,
  paragraphsNaming,
  parseReview,
  reviewWindow,
  type ReviewManifest,
} from "../../../src/core/engine/review-strategy";
import { REVIEW_SYSTEM } from "../../../src/core/utils/prompts";
import type { Thread } from "../../../src/core/store/types";

const sections = (...texts: string[]) => ({
  sectionIds: texts.map((_, i) => 100 + i),
  textBySection: new Map(texts.map((t, i) => [100 + i, t])),
});

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The Shared Apiary",
    state: "They work the hives together.",
    latent: "Pell means to sell.",
    entityIds: ["a", "b"],
    status: "open",
    ...over,
  };
}

const entities = [
  {
    id: "a",
    name: "Ines Corbel",
    category: "Character",
    summary: "Keeps the east hives.",
  },
  { id: "b", name: "Pell", category: "Character", summary: "" },
  { id: "c", name: "The Cooperative", category: "Faction", summary: "" },
];
const aliases = {
  a: ["Ines Corbel", "ines"],
  b: ["Pell"],
  c: ["The Cooperative"],
};

describe("the review window", () => {
  it("reads everything on a branch never reviewed", () => {
    const w = reviewWindow({
      ...sections("one", "", "three"),
      watermark: null,
    });
    expect(w.paragraphs).toEqual(["one", "three"]);
    expect(w.backlog).toBe(2);
    expect(w.reached).toEqual({ sectionId: 102, offset: 5 });
  });

  it("starts after the watermark, including what was appended to its section", () => {
    const w = reviewWindow({
      ...sections("read. appended", "next"),
      watermark: { sectionId: 100, offset: 5 },
    });
    expect(w.paragraphs).toEqual(["appended", "next"]);
  });

  it("stops at a paragraph boundary when the limit is reached, and counts the rest as backlog", () => {
    const w = reviewWindow(
      {
        ...sections("aaaa", "bbbb", "cccc"),
        watermark: { sectionId: 100, offset: 0 },
      },
      9,
    );
    expect(w.paragraphs).toEqual(["aaaa", "bbbb"]);
    expect(w.backlog).toBe(3);
    expect(w.reached).toEqual({ sectionId: 101, offset: 4 });
  });

  it("takes one oversized paragraph whole rather than cutting it", () => {
    const w = reviewWindow(
      {
        ...sections("a".repeat(50), "b"),
        watermark: { sectionId: 100, offset: 0 },
      },
      9,
    );
    expect(w.paragraphs).toEqual(["a".repeat(50)]);
  });

  it("starts a story never reviewed from its latest prose, not its first page", () => {
    const w = reviewWindow(
      { ...sections("aaaa", "bbbb", "cccc"), watermark: null },
      9,
    );
    expect(w.paragraphs).toEqual(["bbbb", "cccc"]);
    expect(w.backlog).toBe(2);
    expect(w.reached).toEqual({ sectionId: 102, offset: 4 });
  });

  it("does the same when the watermark's section is gone from a long story", () => {
    const w = reviewWindow(
      {
        ...sections("aaaa", "bbbb", "cccc"),
        watermark: { sectionId: 999, offset: 2 },
      },
      9,
    );
    expect(w.paragraphs).toEqual(["bbbb", "cccc"]);
    expect(w.backlog).toBe(2);
    expect(w.reached).toEqual({ sectionId: 102, offset: 4 });
  });

  it("takes an oversized last paragraph whole, and reaches past a blank tail", () => {
    const w = reviewWindow(
      { ...sections("b", "a".repeat(50), ""), watermark: null },
      9,
    );
    expect(w.paragraphs).toEqual(["a".repeat(50)]);
    expect(w.backlog).toBe(1);
    expect(w.reached).toEqual({ sectionId: 102, offset: 0 });
  });

  it("re-reads from the start when the watermark's section is gone", () => {
    const w = reviewWindow({
      ...sections("one"),
      watermark: { sectionId: 999, offset: 0 },
    });
    expect(w.paragraphs).toEqual(["one"]);
  });

  it("is empty when nothing is unread", () => {
    const w = reviewWindow({
      ...sections("one"),
      watermark: { sectionId: 100, offset: 3 },
    });
    expect(w.paragraphs).toEqual([]);
    expect(w.backlog).toBe(0);
  });
});

describe("the review manifest", () => {
  const paragraphs = [
    "Ines lit the smoker.",
    "Pell watched Ines work.",
    "The road was empty.",
  ];

  it("tags a Thread whose cast is on stage, by alias", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread()],
      aliases,
      paragraphs,
    });
    expect(m.threads[0].inProse).toBe(true);
    expect(m.threads[0].cast).toEqual(["Ines Corbel", "Pell"]);
  });

  it("does not tag a two-person Thread when only one of them appears", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread()],
      aliases,
      paragraphs: ["Ines lit the smoker."],
    });
    expect(m.threads[0].inProse).toBe(false);
  });

  it("lists entities the window names plus every open Thread's cast, and leaves out the rest", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread({ entityIds: ["c"] })],
      aliases,
      paragraphs: ["Ines lit the smoker."],
    });
    expect(m.entities.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("leaves concluded Threads out", () => {
    const m = buildReviewManifest({
      foundation: "",
      entities,
      threads: [thread({ status: "concluded" })],
      aliases,
      paragraphs,
    });
    expect(m.threads).toEqual([]);
  });
});

describe("the review prompt", () => {
  it("orders system, foundation, entities, threads, prose, instruction", async () => {
    const manifest = buildReviewManifest({
      foundation: "[NARRATIVE FOUNDATION]\nIntent: a slow feud",
      entities,
      threads: [thread()],
      aliases,
      paragraphs: ["Ines lit the smoker.", "Pell watched Ines work."],
    });
    const { messages } = await createReviewFactory(manifest, [
      "Ines lit the smoker.",
      "Pell watched Ines work.",
    ])();
    const blocks = messages.map((m) => m.content ?? "");
    expect(blocks[0]).toBe(REVIEW_SYSTEM);
    expect(blocks[1]).toBe("[NARRATIVE FOUNDATION]\nIntent: a slow feud");
    expect(blocks[2]).toBe(
      "=== KNOWN ENTITIES ===\n- Ines Corbel [Character]: Keeps the east hives.\n- Pell [Character]",
    );
    expect(blocks[3]).toBe(
      "=== THREADS ===\n- The Shared Apiary [in this prose] | cast: Ines Corbel, Pell\n  STATE: They work the hives together.\n  PRIVATE: Pell means to sell.",
    );
    expect(blocks[4]).toBe(
      "=== PROSE ===\nInes lit the smoker.\n\nPell watched Ines work.",
    );
    expect(blocks).toHaveLength(6);
  });

  it("says so when there are no Threads, and omits an empty foundation", async () => {
    const manifest = buildReviewManifest({
      foundation: "",
      entities,
      threads: [],
      aliases,
      paragraphs: ["Ines."],
    });
    const blocks = (
      await createReviewFactory(manifest, ["Ines."])()
    ).messages.map((m) => m.content ?? "");
    expect(blocks[2]).toBe("=== THREADS ===\n(none yet)");
    expect(blocks).toHaveLength(5);
  });
});

describe("reading a review", () => {
  const manifest: ReviewManifest = {
    foundation: "",
    entities,
    threads: [
      {
        id: "t1",
        title: "The Shared Apiary",
        cast: [],
        entityIds: ["a", "b"],
        state: "",
        latent: "",
        inProse: true,
      },
    ],
  };

  it("reads the three commands", () => {
    expect(
      parseReview(
        "UPDATE The Shared Apiary\nCONCLUDE the shared apiary\nADMIT The Sold Hives | Ines Corbel, The Cooperative",
        manifest,
      ),
    ).toEqual([
      { kind: "update", threadId: "t1" },
      { kind: "conclude", threadId: "t1" },
      { kind: "admit", title: "The Sold Hives", entityIds: ["a", "c"] },
    ]);
  });

  it("ignores reasoning lines, including ones that end in a verb", () => {
    const text =
      "The Shared Apiary: the prose shows Pell sell the hives; the record says they share them: UPDATE\nAdmission: Ines Corbel and Pell. Nothing new stands between them: no command";
    expect(parseReview(text, manifest)).toEqual([]);
  });

  it("drops a command naming a Thread it was not shown", () => {
    expect(parseReview("UPDATE The Hanging Nail", manifest)).toEqual([]);
  });

  it("drops an ADMIT naming anyone who is not a known entity", () => {
    expect(
      parseReview(
        "ADMIT The Funny Look | Ines Corbel, a passing couple",
        manifest,
      ),
    ).toEqual([]);
  });

  it("drops an ADMIT with no cast, or no bar", () => {
    expect(parseReview("ADMIT The Glass On The Table", manifest)).toEqual([]);
    expect(parseReview("ADMIT The Glass On The Table | ", manifest)).toEqual(
      [],
    );
  });

  it("peels decoration from the title and the names", () => {
    expect(
      parseReview(
        '- ADMIT "The Sold Hives" | "Ines Corbel", [Pell] — because of the sale',
        manifest,
      ),
    ).toEqual([
      { kind: "admit", title: "The Sold Hives", entityIds: ["a", "b"] },
    ]);
  });

  it("names a cast member once however often the model repeats them", () => {
    expect(parseReview("ADMIT X | Pell, Pell", manifest)).toEqual([
      { kind: "admit", title: "X", entityIds: ["b"] },
    ]);
  });
});

describe("the floors", () => {
  const sustained = [
    "Ines counted frames.",
    "The Cooperative sent a letter to Ines.",
    "Ines read it twice.",
    "The Cooperative wanted the east hives.",
    "The Cooperative would not wait, Ines said.",
  ];
  const context = {
    threads: [thread()],
    paragraphs: sustained,
    aliases,
    threadCap: 8,
  };
  const admit = (entityIds: string[]) => ({
    kind: "admit" as const,
    title: "The Sold Hives",
    entityIds,
  });

  it("counts paragraphs by alias", () => {
    expect(paragraphsNaming(sustained, aliases.a)).toBe(4);
    expect(ADMIT_MIN_PARAGRAPHS).toBe(3);
  });

  it("admits a cast that recurs", () => {
    expect(applyFloors([admit(["a", "c"])], context).accepted).toEqual([
      admit(["a", "c"]),
    ]);
  });

  it("refuses a cast member named in fewer than three paragraphs", () => {
    const result = applyFloors([admit(["b", "c"])], context);
    expect(result.accepted).toEqual([]);
    expect(result.refused[0].reason).toContain("fewer than 3 paragraphs");
  });

  it("turns an admission of an existing cast into an update of that Thread", () => {
    const paragraphs = ["Ines and Pell.", "Pell and Ines.", "Ines, Pell."];
    expect(
      applyFloors([admit(["b", "a"])], { ...context, paragraphs }).accepted,
    ).toEqual([{ kind: "update", threadId: "t1" }]);
  });

  it("admits at most one Thread per review", () => {
    const result = applyFloors(
      [admit(["a", "c"]), { kind: "admit", title: "Second", entityIds: ["c"] }],
      context,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.refused[0].reason).toBe("one admission per review");
  });

  it("admits nothing at the thread limit", () => {
    const result = applyFloors([admit(["a", "c"])], {
      ...context,
      threadCap: 1,
    });
    expect(result.accepted).toEqual([]);
    expect(result.refused[0].reason).toBe("thread limit reached");
  });

  it("does not count concluded Threads against the limit", () => {
    const threads = [thread({ status: "concluded" })];
    expect(
      applyFloors([admit(["a", "c"])], { ...context, threads, threadCap: 1 })
        .accepted,
    ).toHaveLength(1);
  });

  it("lets a conclude outrank an update of the same Thread", () => {
    expect(
      applyFloors(
        [
          { kind: "conclude", threadId: "t1" },
          { kind: "update", threadId: "t1" },
        ],
        context,
      ).accepted,
    ).toEqual([{ kind: "conclude", threadId: "t1" }]);
  });

  it("refuses to touch a Thread that is no longer open", () => {
    const threads = [thread({ status: "concluded" })];
    expect(
      applyFloors([{ kind: "update", threadId: "t1" }], { ...context, threads })
        .accepted,
    ).toEqual([]);
  });
});
