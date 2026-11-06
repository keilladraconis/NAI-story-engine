import { describe, it, expect } from "vitest";
import {
  parseSeed,
  mergeBrief,
  nextField,
  interviewDone,
  oneQuestion,
  withoutQuestions,
  answered,
  missingBrief,
} from "../../src/core/facilitator";
import { parseIssues, rewriteTokens } from "../../src/core/critic";
import { emptyBrief } from "../../src/core/store/slices/canon";

let n = 0;
const makeId = () => `i${n++}`;

describe("parseSeed", () => {
  it("reads ## sections, multi-line, and skips unknown headings", () => {
    expect(
      parseSeed(
        "## TITLE\nThe Keeper\n\n## PREMISE\nIlse keeps a light.\nTam came back.\n\n## VOICE\n\n## OTHER\nx",
      ),
    ).toEqual({
      title: "The Keeper",
      premise: "Ilse keeps a light.\nTam came back.",
      voice: "",
    });
  });
});

describe("mergeBrief", () => {
  it("takes rewritten sections and never erases with an empty or placeholder one", () => {
    const current = { ...emptyBrief, voice: "First, present", title: "Mine" };
    expect(
      mergeBrief(current, {
        voice: "Third, past",
        premise: "P",
        title: "",
        heat: "Unspecified",
      }),
    ).toEqual({ voice: "Third, past", premise: "P" });
  });

  it("takes None for limits only", () => {
    expect(mergeBrief(emptyBrief, { limits: "None", pace: "None" })).toEqual({
      limits: "None",
    });
  });
});

describe("parseIssues", () => {
  it("reads KIND | text lines of known kinds", () => {
    const issues = parseIssues(
      "contradiction | scar on the right brow vs left eye\n- past-the-now | 'has made peace'\nstyle | too long\nNONE",
      makeId,
    );
    expect(issues.map((i) => [i.kind, i.text])).toEqual([
      ["contradiction", "scar on the right brow vs left eye"],
      ["past-the-now", "'has made peace'"],
    ]);
  });

  it("reads NONE as no issues", () => {
    expect(parseIssues("NONE", makeId)).toEqual([]);
  });
});

describe("rewriteTokens", () => {
  it("grows with the text and stays under the output bucket", () => {
    expect(rewriteTokens("a".repeat(300))).toBe(400);
    expect(rewriteTokens("a".repeat(100000))).toBe(2000);
  });
});

describe("the interview", () => {
  it("works on the first unready section, in order", () => {
    expect(nextField(emptyBrief)?.field).toBe("premise");
    expect(
      nextField({
        ...emptyBrief,
        premise: "x".repeat(300),
        desires: "x".repeat(120),
        world: "x".repeat(80),
        genre: "G",
      })?.field,
    ).toBe("voice");
  });

  it("is done once premise, voice, genre, heat, pace and limits are set", () => {
    const full = {
      ...emptyBrief,
      premise: "P".repeat(300),
      desires: "D".repeat(120),
      world: "W".repeat(80),
      voice: "V",
      genre: "G",
      heat: "H",
      pace: "Slow",
      limits: "None",
      title: "T",
    };
    expect(interviewDone(full)).toBe(true);
    expect(interviewDone({ ...full, limits: "" })).toBe(false);
  });

  it("keeps a reply to its last question", () => {
    expect(oneQuestion("Noted: slow. Which tense? And who narrates?")).toBe(
      "Noted: slow. And who narrates?",
    );
    expect(
      oneQuestion(
        "So it is about Drip? Third person past, first person present, or else?",
      ),
    ).toBe("Third person past, first person present, or else?");
    expect(oneQuestion("The brief is ready.")).toBe("The brief is ready.");
  });
});

describe("withoutQuestions", () => {
  it("drops questions from a closing reply", () => {
    expect(
      withoutQuestions(
        "The brief is ready. Shall we go on? Next is Vignettes.",
      ),
    ).toBe("The brief is ready. Next is Vignettes.");
  });
});

describe("answers", () => {
  it("never counts Unspecified as answered, and None only for limits", () => {
    expect(answered("voice", "Unspecified")).toBe(false);
    expect(answered("title", "None")).toBe(false);
    expect(answered("limits", "None")).toBe(true);
    expect(answered("voice", "Third, past")).toBe(true);
  });

  it("keeps the talk on a thin premise before moving on", () => {
    expect(
      nextField({ ...emptyBrief, premise: "A jackal wishes." })?.field,
    ).toBe("premise");
    expect(nextField({ ...emptyBrief, premise: "x".repeat(300) })?.field).toBe(
      "desires",
    );
  });

  it("names what the brief still lacks, title included", () => {
    expect(
      missingBrief({ ...emptyBrief, premise: "P", voice: "Unspecified" }),
    ).toEqual([
      "desires",
      "world",
      "genre",
      "voice",
      "heat",
      "pace",
      "limits",
      "title",
    ]);
  });
});
