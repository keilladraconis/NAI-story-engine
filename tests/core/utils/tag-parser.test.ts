import { describe, it, expect } from "vitest";
import {
  parseTag,
  parseTagAll,
  splitSections,
  formatTagsWithEmoji,
  restoreTagsFromEmoji,
  stripStyleBrackets,
  stripRefineMarkers,
} from "../../../src/core/utils/tag-parser";

// ─────────────────────────────────────────────────────────────────────────────
// parseTag
// ─────────────────────────────────────────────────────────────────────────────

describe("parseTag", () => {
  it("extracts content after the tag", () => {
    const text = "[GOAL] The hero must sacrifice everything";
    expect(parseTag(text, "GOAL")).toBe("The hero must sacrifice everything");
  });

  it("stops at the next tag on a new line", () => {
    const text = "[GOAL] First goal\n[WHY] Because reasons";
    expect(parseTag(text, "GOAL")).toBe("First goal");
  });

  it("handles multiline content within a tag section", () => {
    const text =
      "[PREREQ] The hero holds a dark secret\nIt drives the act 2 reveal\n[LOADBEARING] Key to tension";
    expect(parseTag(text, "PREREQ")).toBe(
      "The hero holds a dark secret\nIt drives the act 2 reveal",
    );
  });

  it("returns null when tag is absent", () => {
    const text = "[GOAL] Something";
    expect(parseTag(text, "WHY")).toBeNull();
  });

  it("returns content to end of string when no following tag", () => {
    const text = "[WHY] The stakes must feel real";
    expect(parseTag(text, "WHY")).toBe("The stakes must feel real");
  });

  it("trims leading and trailing whitespace from result", () => {
    const text = "[GOAL]   spaced content   ";
    expect(parseTag(text, "GOAL")).toBe("spaced content");
  });

  it("returns empty string for tag with no content", () => {
    const text = "[GOAL]\n[WHY] reason";
    expect(parseTag(text, "GOAL")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTagAll
// ─────────────────────────────────────────────────────────────────────────────

describe("parseTagAll", () => {
  it("returns all occurrences of a repeated tag", () => {
    const text =
      "[PREREQ] First prereq\n[PREREQ] Second prereq\n[PREREQ] Third prereq";
    const results = parseTagAll(text, "PREREQ");
    expect(results).toEqual(["First prereq", "Second prereq", "Third prereq"]);
  });

  it("returns empty array when tag is absent", () => {
    expect(parseTagAll("[GOAL] something", "PREREQ")).toEqual([]);
  });

  it("handles mixed tags — only returns the specified tag", () => {
    const text = "[PREREQ] A\n[LOADBEARING] B\n[PREREQ] C";
    expect(parseTagAll(text, "PREREQ")).toEqual(["A", "C"]);
  });

  it("filters out empty occurrences", () => {
    const text = "[PREREQ]\n[PREREQ] real content";
    expect(parseTagAll(text, "PREREQ")).toEqual(["real content"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// splitSections
// ─────────────────────────────────────────────────────────────────────────────

describe("splitSections", () => {
  it("splits on default +++ separator", () => {
    const text = "Section A\n+++\nSection B\n+++\nSection C";
    expect(splitSections(text)).toEqual([
      "Section A",
      "Section B",
      "Section C",
    ]);
  });

  it("trims whitespace from each section", () => {
    const text = "  A  \n+++\n  B  ";
    expect(splitSections(text)).toEqual(["A", "B"]);
  });

  it("filters out empty sections", () => {
    const text = "A\n+++\n\n+++\nB";
    expect(splitSections(text)).toEqual(["A", "B"]);
  });

  it("accepts a custom separator", () => {
    const text = "X---Y---Z";
    expect(splitSections(text, "---")).toEqual(["X", "Y", "Z"]);
  });

  it("returns single-element array when no separator present", () => {
    expect(splitSections("Only one section")).toEqual(["Only one section"]);
  });

  it("returns empty array for blank input", () => {
    expect(splitSections("")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatTagsWithEmoji
// ─────────────────────────────────────────────────────────────────────────────

describe("formatTagsWithEmoji", () => {
  it("replaces known tags with emoji", () => {
    expect(formatTagsWithEmoji("[TENSION] something")).toBe("🔥 something");
    expect(formatTagsWithEmoji("[CREATE] element")).toBe("✨ element");
    expect(formatTagsWithEmoji("[LINK] dep")).toBe("🔗 dep");
  });

  it("replaces unknown tags with bold text", () => {
    expect(formatTagsWithEmoji("[CUSTOM] text")).toBe("**CUSTOM** text");
  });

  it("replaces multiple tags in the same string", () => {
    const text = "[TENSION] end state\n[CREATE] element";
    const result = formatTagsWithEmoji(text);
    expect(result).toContain("🔥");
    expect(result).toContain("✨");
  });

  it("leaves untagged text unchanged", () => {
    expect(formatTagsWithEmoji("plain text")).toBe("plain text");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// restoreTagsFromEmoji
// ─────────────────────────────────────────────────────────────────────────────

describe("restoreTagsFromEmoji", () => {
  it("restores emoji back to tag format", () => {
    expect(restoreTagsFromEmoji("🔥 something")).toBe("[TENSION] something");
  });

  it("is the inverse of formatTagsWithEmoji for known tags", () => {
    const original = "[TENSION] end\n[CREATE] element";
    const roundTripped = restoreTagsFromEmoji(formatTagsWithEmoji(original));
    expect(roundTripped).toBe(original);
  });

  it("leaves plain text unchanged", () => {
    expect(restoreTagsFromEmoji("plain text")).toBe("plain text");
  });
});

describe("stripStyleBrackets", () => {
  it("strips [ Style: ... ] wrapper and returns inner content", () => {
    const input =
      "[ Style: Joanna Russ's sardonic prose meets Jeff VanderMeer's lush ecology ]";
    expect(stripStyleBrackets(input)).toBe(
      "Joanna Russ's sardonic prose meets Jeff VanderMeer's lush ecology",
    );
  });

  it("leaves text without [ Style: ] wrapper unchanged", () => {
    const input =
      "Joanna Russ's sardonic prose meets Jeff VanderMeer's lush ecology";
    expect(stripStyleBrackets(input)).toBe(input);
  });

  it("handles leading/trailing whitespace around the wrapper", () => {
    const input = "  [ Style: inner content ]  ";
    expect(stripStyleBrackets(input)).toBe("inner content");
  });

  it("handles missing closing bracket (stop sequence stripped it)", () => {
    const input = "[ Style: no closing bracket";
    expect(stripStyleBrackets(input)).toBe("no closing bracket");
  });
});

describe("stripRefineMarkers", () => {
  // A refine shows the model its target inside `=== REFINE TARGET (attg) ===`
  // / `=== END TARGET ===` framing. Shown a delimited block and asked to
  // rewrite it, a model reasonably reproduces the delimiters — so the ATTG a
  // writer commits arrives with the scaffolding still attached. The framing is
  // never content, whatever surrounds it.
  it("removes the header the model copied from its own prompt", () => {
    expect(
      stripRefineMarkers(
        "=== REFINE TARGET (attg) ===\n[ Fantasy; Ada; adventure ]",
      ),
    ).toBe("[ Fantasy; Ada; adventure ]");
  });

  it("removes the footer as well as the header", () => {
    expect(
      stripRefineMarkers(
        "=== REFINE TARGET (style) ===\nTerse and cold.\n=== END TARGET ===",
      ),
    ).toBe("Terse and cold.");
  });

  it("removes a footer that arrived without a header", () => {
    expect(stripRefineMarkers("Terse and cold.\n=== END TARGET ===")).toBe(
      "Terse and cold.",
    );
  });

  it("does not need the field name, or the spacing, to match", () => {
    // The model is imitating, not quoting: it drops the field, changes the
    // rule length, loses a space. A matcher that only knows the exact string
    // the prompt used catches the one case nobody would have shipped.
    expect(
      stripRefineMarkers(
        "==== REFINE TARGET ====\nAda, alone.\n==END TARGET==",
      ),
    ).toBe("Ada, alone.");
  });

  it("returns text with no markers exactly as it arrived", () => {
    // Not a whitespace policy. Continuation joins chunks on a trailing space,
    // and a generation that legitimately ends in one is committed with it —
    // an unconditional trim here silently rewrote every refine that had no
    // markers to remove.
    const text = "  Ada, alone.\nThe city, after. ";
    expect(stripRefineMarkers(text)).toBe(text);
  });

  it("leaves ordinary content alone, rules included", () => {
    // A field may legitimately contain a rule of equals signs; only the two
    // named markers are framing.
    const text = "Ada, alone.\n===\nThe city, after.";
    expect(stripRefineMarkers(text)).toBe(text);
  });
});
