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
import { parseIssues, quotesDoc, rewriteTokens } from "../../src/core/critic";
import { parseOffers } from "../../src/core/offers";
import { firstLine } from "../../src/core/text";
import { parsePlan } from "../../src/core/build";
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

  it("drops an issue whose words at fault are another document's", () => {
    const doc =
      "Satiety and Growth: this lifestyle, while pursued willingly, has no negative costs.";
    const issues = parseIssues(
      [
        `contradiction | "The Body (The Internal Opposition)" in the Factions document opposes "has no negative costs".`,
        `contradiction | "This lifestyle, while pursued   willingly, has no negative costs" disagrees with Factions.`,
        `contradiction | “Satiety and Growth: this lifestyle… no negative costs” is too strong.`,
        "missing-family | Nick's siblings are not named.",
      ].join("\n"),
      makeId,
      doc,
    );
    expect(issues.map((i) => i.text.slice(0, 20))).toEqual([
      `"This lifestyle, whi`,
      "“Satiety and Growth:",
      "Nick's siblings are ",
    ]);
  });
});

describe("quotesDoc", () => {
  it("keeps an issue without a quote", () => {
    expect(quotesDoc("the family is missing", "anything")).toBe(true);
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

  it("reads question lines written without ###", () => {
    const round = parseRound(
      [
        "LEAD: Let's define the boundaries.",
        "LIMITS: What are your hard limits? | any",
        "- No vore.",
        "- No scat.",
        "TITLE: Which title feels right?",
        "- A Serperior's Indulgence",
        "- Regal Appetites",
      ].join("\n"),
    );
    expect(round.questions.map((q) => [q.header, q.question, q.multi])).toEqual(
      [
        ["LIMITS", "What are your hard limits?", true],
        ["TITLE", "Which title feels right?", false],
      ],
    );
    expect(round.questions[0].options[0].label).toBe("No vore.");
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

describe("parseOffers", () => {
  it("reads the pitches under the first question and drops the reading", () => {
    const text = [
      "READING: Both kept vignettes are early; the far end is missing.",
      "LEAD: Here is where it could go next.",
      "### Next | Which scene next?",
      "- The goddess of the living room | Cecile, immense, fills the floor.",
      "- Seen | A visitor sees her for the first time.",
    ].join("\n");
    expect(parseOffers(text)).toEqual({
      lead: "Here is where it could go next.",
      offers: [
        {
          label: "The goddess of the living room",
          description: "Cecile, immense, fills the floor.",
        },
        {
          label: "Seen",
          description: "A visitor sees her for the first time.",
        },
      ],
    });
  });
  it("drops the format's placeholder lines echoed back", () => {
    const text = [
      "### Next | Which scene next?",
      "- <a short title> | <the pitch>",
      "- <a short title> | <the pitch>",
      "- The Feast | Cecile lies heaped across three cushions.",
      "- Mirror's Lie | Cecile stares at her reflection.",
    ].join("\n");
    expect(parseOffers(text).offers.map((o) => o.label)).toEqual([
      "The Feast",
      "Mirror's Lie",
    ]);
  });
  it("offers nothing when no question can be read", () => {
    expect(parseOffers("Just some prose.").offers).toEqual([]);
  });
});

describe("firstLine", () => {
  it("skips a bracketed tag line", () => {
    expect(firstLine("[ Reticent ]\nThe couch gave a groan.")).toBe(
      "The couch gave a groan.",
    );
  });
});

describe("parsePlan", () => {
  it("reads kind | title | why, titles unnamed kinds by kind, drops junk and repeats", () => {
    const text = [
      "READING: A domestic story; two principals.",
      "- geography | The apartment | where they live",
      "- dossier | Cecile | the retired Serperior",
      "- dossier | cecile | again",
      "- dossier | <a name> | a placeholder",
      "- dossier |  | no name",
      "- weather | Rain | not a kind",
      "- factions | Factions | not applicable to this story",
      "- plots | Pressures | what could open scenes",
    ].join("\n");
    expect(
      parsePlan(text).map((i) => [i.kind, i.title, i.why, i.picked]),
    ).toEqual([
      ["geography", "Geography", "where they live", true],
      ["dossier", "Cecile", "the retired Serperior", true],
      ["plots", "Plot pressures", "what could open scenes", true],
    ]);
  });
});
