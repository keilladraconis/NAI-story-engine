import { describe, it, expect } from "vitest";
import { parseBrief, mergeBrief } from "../../src/core/facilitator";
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
  it("fills empty fields and never overwrites the writer's", () => {
    const current = { ...emptyBrief, title: "Mine" };
    expect(mergeBrief(current, { title: "Theirs", premise: "P" })).toEqual({
      premise: "P",
    });
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
