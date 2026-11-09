import { describe, it, expect } from "vitest";
import {
  parseSeed,
  mergeBrief,
  nextField,
  interviewDone,
  parseRound,
  answerText,
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
  it("asks for the frame first, then builds around it", () => {
    expect(nextField(emptyBrief)?.field).toBe("heat");
    expect(
      nextField({ ...emptyBrief, voice: "V", heat: "Explicit" })?.field,
    ).toBe("desires");
    expect(
      nextField({
        ...emptyBrief,
        premise: "x".repeat(300),
        desires: "x".repeat(120),
        world: "x".repeat(80),
        heat: "H",
        voice: "V",
        pace: "P",
      })?.field,
    ).toBe("limits");
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
});

describe("rounds", () => {
  const text = [
    "READING: An expansion story; the sentience model is open.",
    "LEAD: A few things to pin down.",
    "### Heat | How explicit should it get?",
    "- Tender | No explicit content",
    "- Explicit graphic | Detailed and raw",
    "### Hard limits | Anything you never want? | any",
    "- No vore | No swallowing whole",
    "- No scat",
    "### Broken | A question with one option",
    "- Only",
  ].join("\n");

  it("reads the lead and the questions, and drops the reading", () => {
    const round = parseRound(text);
    expect(round.lead).toBe("A few things to pin down.");
    expect(round.questions).toEqual([
      {
        header: "Heat",
        question: "How explicit should it get?",
        options: [
          { label: "Tender", description: "No explicit content" },
          { label: "Explicit graphic", description: "Detailed and raw" },
        ],
        multi: false,
      },
      {
        header: "Hard limits",
        question: "Anything you never want?",
        options: [
          { label: "No vore", description: "No swallowing whole" },
          { label: "No scat", description: "" },
        ],
        multi: true,
      },
    ]);
  });

  it("answers with the picks, skipping unanswered questions", () => {
    const { questions } = parseRound(text);
    expect(
      answerText({
        id: "m",
        role: "assistant",
        content: "",
        questions,
        picks: [[], ["No vore", "No scat"]],
      }),
    ).toBe("Hard limits: No vore, No scat");
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
    const wanted = {
      ...emptyBrief,
      desires: "x".repeat(120),
      heat: "H",
      voice: "V",
    };
    expect(nextField({ ...wanted, premise: "A jackal wishes." })?.field).toBe(
      "premise",
    );
    expect(nextField({ ...wanted, premise: "x".repeat(300) })?.field).toBe(
      "world",
    );
  });

  it("names what the brief still lacks, title included", () => {
    expect(
      missingBrief({ ...emptyBrief, premise: "P", voice: "Unspecified" }),
    ).toEqual([
      "heat",
      "voice",
      "desires",
      "world",
      "pace",
      "limits",
      "genre",
      "title",
    ]);
  });
});
