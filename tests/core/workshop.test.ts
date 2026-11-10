import { describe, it, expect } from "vitest";
import {
  replaceContext,
  directOnly,
  EMPTY_PAGE_PREFILL,
  LORE_PREFILL,
  opener,
} from "../../src/core/workshop/context";
import {
  draftIds,
  inDraft,
  recoverBoundary,
  splitStartingPoint,
} from "../../src/core/workshop/draft-region";
import { attgLine, buildFrame, fit } from "../../src/core/workshop/frames";
import {
  defaultDirection,
  vignetteDirection,
  saveLabel,
  sameTarget,
  targetLabel,
} from "../../src/core/workshop/targets";
import { rootReducer, type RootState } from "../../src/core/store";
import { emptyBrief } from "../../src/core/store/slices/canon";

// Xialong's native editor context, as the editor-workshop probe logged it.
const NATIVE: Message[] = [
  { role: "system", content: "You are Xialong…" },
  {
    role: "user",
    content: "Relevant persistent information:\n[ Memory ]\n***\nWrite.",
  },
  { role: "assistant", content: "The supply boat was late again." },
];

function withCanon(patch: Partial<RootState["canon"]>): RootState {
  const base = rootReducer(undefined, { type: "@@INIT" });
  return { ...base, canon: { ...base.canon, ...patch } };
}

describe("replaceContext", () => {
  it("keeps the system message and swaps the Memory slot, direction and prefill", () => {
    const out = replaceContext(
      NATIVE,
      "FRAME",
      "Write a scene.",
      "Draft so far",
    );
    expect(out).toEqual([
      NATIVE[0],
      {
        role: "user",
        content: "Relevant persistent information:\nFRAME\n***\nWrite a scene.",
      },
      { role: "assistant", content: "Draft so far" },
    ]);
  });

  it("prefills an empty draft the way NovelAI prefills an empty page", () => {
    const out = replaceContext(NATIVE, "F", "D", "");
    expect(out[2]).toEqual({ role: "assistant", content: EMPTY_PAGE_PREFILL });
  });

  it("opens notes with the lore divider and their title, scenes with the prose one", () => {
    expect(opener({ kind: "doc", docId: "a" }, "Geography")).toBe(
      `${LORE_PREFILL}Geography\n`,
    );
    expect(opener({ kind: "vignette" }, "Vignette")).toBe(EMPTY_PAGE_PREFILL);
    const lore = opener({ kind: "doc", docId: "a" }, "Geography");
    const out = replaceContext(NATIVE, "F", "D", "", lore);
    expect(out[2]).toEqual({ role: "assistant", content: "----\nGeography\n" });
    const going = replaceContext(NATIVE, "F", "D", "The river.", lore);
    expect(going[2].content).toBe("----\nGeography\nThe river.");
  });

  it("puts the direction before the prefill when the native context has no user message", () => {
    const out = replaceContext([NATIVE[0], NATIVE[2]], "F", "D", "x");
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("adds both when the native context has neither", () => {
    const out = replaceContext([NATIVE[0]], "F", "D", "");
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });
});

describe("directOnly", () => {
  it("replaces only the trailing Write. of the last user message", () => {
    const out = directOnly(NATIVE, "Write the opening.");
    expect(out[1].content).toBe(
      "Relevant persistent information:\n[ Memory ]\n***\nWrite the opening.",
    );
    expect(out[0]).toBe(NATIVE[0]);
    expect(out[2]).toBe(NATIVE[2]);
  });
});

describe("draft region", () => {
  const ids = [10, 20, 30, 40];

  it("is everything after the boundary", () => {
    expect(draftIds(ids, 20)).toEqual([30, 40]);
    expect(draftIds(ids, 40)).toEqual([]);
  });

  it("is the whole page when the boundary is 0", () => {
    expect(draftIds(ids, 0)).toEqual(ids);
  });

  it("is empty when the boundary is gone", () => {
    expect(draftIds(ids, 99)).toEqual([]);
  });

  it("knows whether a generation starts in the draft", () => {
    expect(inDraft(ids, 20, 30)).toBe(true);
    expect(inDraft(ids, 20, 20)).toBe(false);
    expect(inDraft(ids, 20, 10)).toBe(false);
  });

  it("recovers a lost boundary from the last known draft", () => {
    // Boundary 20 was deleted; the draft was [30, 40].
    expect(recoverBoundary([10, 30, 40], [30, 40])).toBe(10);
    expect(recoverBoundary([30, 40], [30, 40])).toBe(0);
    // Nothing of the old draft is left: the page is story, a draft starts after it.
    expect(recoverBoundary([10, 11], [30, 40])).toBe(11);
    expect(recoverBoundary([], [30])).toBe(0);
  });
});

describe("splitStartingPoint", () => {
  it("splits on Now and Not yet headings in their usual dresses", () => {
    expect(
      splitStartingPoint(
        "## Now\nThe boat is late.\n\n**Not yet:**\nIlse knows.",
      ),
    ).toEqual({
      now: "The boat is late.",
      notYet: "Ilse knows.",
    });
  });

  it("reads bracketed headings", () => {
    expect(
      splitStartingPoint(
        "[ NOW ]\nThe boat is late.\n[ NOT YET ]\nIlse knows.",
      ),
    ).toEqual({
      now: "The boat is late.",
      notYet: "Ilse knows.",
    });
  });

  it("treats text without headings as Now", () => {
    expect(splitStartingPoint("The boat is late.")).toEqual({
      now: "The boat is late.",
      notYet: "",
    });
  });
});

describe("frames", () => {
  it("writes an ATTG-style line from title and genre, leaving out what is empty", () => {
    expect(
      attgLine({ ...emptyBrief, title: "The Keeper", genre: "Literary" }),
    ).toBe("[ Title: The Keeper; Genre: Literary ]");
    expect(attgLine({ ...emptyBrief, genre: "Literary" })).toBe(
      "[ Genre: Literary ]",
    );
    expect(attgLine(emptyBrief)).toBe("");
  });

  it("keeps a writer's ; from splitting the line's fields", () => {
    expect(
      attgLine({ ...emptyBrief, genre: "Literary; lighthouse, family" }),
    ).toBe("[ Genre: Literary, lighthouse, family ]");
  });

  it("drops the lowest-priority blocks first and always keeps the first", () => {
    expect(fit(["brief", "a".repeat(10), "b".repeat(10)], 25)).toBe(
      `brief\n\n${"a".repeat(10)}`,
    );
    expect(fit(["b".repeat(50), "x"], 10)).toBe("b".repeat(50));
  });

  it("never puts limits in a frame", () => {
    const state = withCanon({
      brief: {
        ...emptyBrief,
        premise: "A lighthouse.",
        limits: "NO-SUCH-THING",
      },
    });
    expect(buildFrame(state, { kind: "vignette" })).not.toContain(
      "NO-SUCH-THING",
    );
  });

  it("frames a document with the others, never with itself", () => {
    const state = withCanon({
      brief: { ...emptyBrief, premise: "A lighthouse." },
      docs: [
        { id: "a", kind: "dossier", title: "Tam", text: "TAM-TEXT" },
        { id: "b", kind: "geography", title: "Geography", text: "GEO-TEXT" },
      ],
    });
    const frame = buildFrame(state, { kind: "doc", docId: "a" });
    expect(frame).toContain("GEO-TEXT");
    expect(frame).not.toContain("TAM-TEXT");
  });

  it("gives a document no prose to imitate: no vignettes, no narrative voice", () => {
    const state = withCanon({
      brief: { ...emptyBrief, premise: "P", voice: "Third limited, past." },
      vignettes: [{ id: "v", title: "t", text: "VIGNETTE" }],
      docs: [{ id: "a", kind: "geography", title: "Geography", text: "" }],
    });
    const frame = buildFrame(state, { kind: "doc", docId: "a" });
    expect(frame).not.toContain("VIGNETTE");
    expect(frame).not.toContain("Told in");
  });

  it("labels vignettes as tone, not events", () => {
    const state = withCanon({
      brief: { ...emptyBrief, premise: "P" },
      vignettes: [{ id: "v", title: "t", text: "VIGNETTE" }],
    });
    expect(buildFrame(state, { kind: "startingPoint" })).toMatch(
      /not things that have happened[\s\S]*VIGNETTE/,
    );
  });
});

describe("targets", () => {
  const state = withCanon({
    docs: [{ id: "a", kind: "dossier", title: "Tam", text: "" }],
  });

  it("labels and names each target's save", () => {
    expect(targetLabel(state, { kind: "doc", docId: "a" })).toBe(
      "Tam · dossier",
    );
    expect(saveLabel(state, { kind: "doc", docId: "a" })).toBe("Save dossier");
    expect(saveLabel(state, { kind: "vignette" })).toBe("Save vignette");
    expect(saveLabel(state, { kind: "opening" })).toBe("Keep opening");
  });

  it("fills a dossier's name into its default direction", () => {
    expect(defaultDirection(state, { kind: "doc", docId: "a" })).toMatch(
      /^Write Tam's dossier/,
    );
  });

  it("asks a dossier for the body's figures", () => {
    const direction = defaultDirection(state, { kind: "doc", docId: "a" });
    expect(direction).toContain("height, or length for a long body");
    expect(direction).toContain("chest-waist-hip where there is no bust");
  });

  it("compares targets by kind and document", () => {
    expect(
      sameTarget({ kind: "doc", docId: "a" }, { kind: "doc", docId: "a" }),
    ).toBe(true);
    expect(
      sameTarget({ kind: "doc", docId: "a" }, { kind: "doc", docId: "b" }),
    ).toBe(false);
    expect(sameTarget({ kind: "vignette" }, { kind: "opening" })).toBe(false);
  });
});

describe("given", () => {
  it("treats Unspecified and None as left open", async () => {
    const { given } = await import("../../src/core/text");
    expect(given("Unspecified")).toBe("");
    expect(given(" none. ")).toBe("");
    expect(given("Literary")).toBe("Literary");
  });
});

describe("writing a whole draft", () => {
  it("drops a scene break or a half-started bracket at the draft's end", async () => {
    const { withoutTrailingBreak } =
      await import("../../src/core/workshop/page");
    expect(withoutTrailingBreak("She left.\n\n***")).toBe("She left.");
    expect(withoutTrailingBreak("She left.\n[ Chap")).toBe("She left.");
    expect(withoutTrailingBreak("She left.")).toBe("She left.");
    expect(withoutTrailingBreak("The river.\n----")).toBe("The river.");
  });

  it("knows the model has started the next piece", async () => {
    const { PIECE_END } = await import("../../src/core/workshop/workshop");
    expect(PIECE_END.test("She left.\n***")).toBe(true);
    expect(PIECE_END.test("She left.\n[ Chapter 2")).toBe(true);
    expect(PIECE_END.test("She left. He stayed.")).toBe(false);
  });

  it("ends a document at the next block's divider, never at a heading or list", async () => {
    const { DOC_END, pieceEnd } =
      await import("../../src/core/workshop/workshop");
    const doc = "## Pressures\n- 4. The couch\n- 5. The scale\n----\nCulture";
    expect(pieceEnd(doc, DOC_END)).toBe(doc.indexOf("\n----"));
    expect(pieceEnd("## Pressures\n- 4. The couch", DOC_END)).toBe(-1);
    expect(pieceEnd("----\n\nScene (write this as", DOC_END)).toBe(0);
  });
});

describe("toSentenceEnd", () => {
  it("cuts a half-written sentence and keeps closing quotes", async () => {
    const { toSentenceEnd } = await import("../../src/core/workshop/page");
    expect(toSentenceEnd("She left. The more she swelled up,")).toBe(
      "She left.",
    );
    expect(toSentenceEnd('He said, "Go." And then')).toBe('He said, "Go."');
    expect(toSentenceEnd("No ending at all")).toBe("No ending at all");
  });
});

describe("vignetteDirection", () => {
  const state = withCanon({
    brief: {
      ...emptyBrief,
      voice: "Third limited, past: we are close to Cecile's thoughts.",
    },
  });
  it("turns a pitch and a note into a scene direction in the brief's voice", () => {
    expect(
      vignetteDirection(state, "Cecile fills the couch.", "More bloated."),
    ).toBe(
      "Write a short scene, told in third limited, past: Cecile fills the couch. More bloated.",
    );
  });
  it("falls back to the default direction with nothing picked or typed", () => {
    expect(vignetteDirection(state, "", " ")).toBe(
      defaultDirection(state, { kind: "vignette" }),
    );
  });
});
