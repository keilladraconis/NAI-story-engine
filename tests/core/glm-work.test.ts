import { describe, it, expect } from "vitest";
import {
  parseBrief,
  mergeBrief,
  nextField,
  interviewDone,
  oneQuestion,
  withoutQuestions,
} from "../../src/core/facilitator";
import { parseIssues, rewriteTokens } from "../../src/core/critic";
import { emptyBrief } from "../../src/core/store/slices/canon";

let n = 0;
const makeId = () => `i${n++}`;

describe("parseBrief", () => {
  it("reads LABEL: value lines and skips empty ones", () => {
    expect(
      parseBrief(
        "TITLE: The Keeper\nGENRE: \nPREMISE: A light.\nVOICE: Third, past\nnoise",
      ),
    ).toEqual({
      title: "The Keeper",
      premise: "A light.",
      voice: "Third, past",
    });
  });
});

describe("mergeBrief", () => {
  it("writes what the answer names, replacing an earlier value", () => {
    const current = { ...emptyBrief, voice: "First, present" };
    expect(mergeBrief(current, { voice: "Third, past", premise: "P" })).toEqual(
      {
        voice: "Third, past",
        premise: "P",
      },
    );
    expect(mergeBrief(current, { voice: "First, present" })).toEqual({});
  });

  it("appends only notes the brief does not already hold", () => {
    const current = { ...emptyBrief, notes: "night watch scenes" };
    expect(
      mergeBrief(current, { notes: "Night watch scenes; a storm" }),
    ).toEqual({
      notes: "night watch scenes; a storm",
    });
    expect(mergeBrief(current, { notes: "night watch scenes" })).toEqual({});
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
  it("asks about the first empty field, in order", () => {
    expect(nextField(emptyBrief)?.field).toBe("premise");
    expect(nextField({ ...emptyBrief, premise: "P" })?.field).toBe("voice");
  });

  it("is done once premise, voice, genre, heat, pace and limits are set", () => {
    const full = {
      ...emptyBrief,
      premise: "P",
      voice: "V",
      genre: "G",
      heat: "H",
      pace: "Slow",
      limits: "None",
    };
    expect(interviewDone(full)).toBe(true);
    expect(interviewDone({ ...full, limits: "" })).toBe(false);
  });

  it("keeps a reply to its first question", () => {
    expect(oneQuestion("Noted: slow. Which tense? And who narrates?")).toBe(
      "Noted: slow. Which tense?",
    );
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
