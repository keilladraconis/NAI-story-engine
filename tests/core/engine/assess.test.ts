import { describe, it, expect } from "vitest";
import { assess } from "../../../src/core/engine/assess";
import type { WorldEntity } from "../../../src/core/store/types";

function entity(id: string, name: string): WorldEntity {
  return {
    id,
    categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
    lifecycle: "live",
    name,
    summary: "",
  };
}

const ADA = entity("e1", "Ada");
const BRENNAN = entity("e2", "Brennan");

const DOC = new Map([
  [1, "The first paragraph."],
  [2, "Ada opened the lock."],
  [3, "Rain again."],
]);

/** A watermark that read all of a section as the default document has it.
 *  Spelled as a helper because the offset is the point: `seen(2)` means "read to
 *  the end of section 2 as it stood", and anything appended to it later is a
 *  tail this assess must still yield. */
function seen(
  sectionId: number,
  offset = (DOC.get(sectionId) as string).length,
) {
  return { sectionId, offset };
}

function input(over: Partial<Parameters<typeof assess>[0]> = {}) {
  return {
    sectionIds: [1, 2, 3],
    watermark: null,
    textBySection: new Map(DOC),
    entities: [ADA, BRENNAN],
    ...over,
  };
}

describe("assess — backlog", () => {
  it("counts everything when there is no watermark yet", () => {
    expect(assess(input()).backlog).toBe(3);
  });

  it("counts only sections after the watermark", () => {
    expect(assess(input({ watermark: seen(1) })).backlog).toBe(2);
  });

  it("is zero when the watermark is the last section", () => {
    const a = assess(input({ watermark: seen(3) }));
    expect(a.backlog).toBe(0);
    expect(a.newText).toBe("");
  });

  it("treats a watermark that no longer exists as unseen", () => {
    // The writer undid past it, or deleted the paragraph. Re-reading is cheap
    // and safe; skipping prose because of a dangling id is not.
    expect(assess(input({ watermark: seen(99, 0) })).backlog).toBe(3);
  });
});

describe("assess — newText", () => {
  it("joins the unseen sections in document order", () => {
    // This string is the volatile tail of the triage prompt, so order and
    // paragraph separation are the payload, not an implementation detail.
    expect(assess(input({ watermark: seen(1) })).newText).toBe(
      "Ada opened the lock.\n\nRain again.",
    );
  });

  it("skips sections the caller could not read", () => {
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[3, "Rain again."]]),
      }),
    );
    // Only what contributes text counts. A section we could not read gives
    // triage nothing to look at, and counting it clears the minimum-new-prose
    // gate and spends a generation on prose that is not in the prompt.
    expect(a.backlog).toBe(1);
    expect(a.newText).toBe("Rain again.");
  });

  it("counts no backlog for paragraphs that are blank", () => {
    // N empty paragraphs would otherwise clear the threshold and buy a triage
    // call whose NEW PROSE block is empty.
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([
          [2, ""],
          [3, "   \n  "],
        ]),
      }),
    );
    expect(a.backlog).toBe(0);
    expect(a.newText).toBe("");
  });
});

// The failure this exists for: NovelAI resumes generation INSIDE a section at a
// character offset (`GenerationPosition` is `{ sectionId, offset }`), so the
// trailing paragraph is routinely extended in place rather than replaced. A
// watermark that only records WHICH section was read marks the extension as
// seen, and everything appended to it is lost permanently — on this pass and on
// every later one.
describe("assess — the watermarked section's tail", () => {
  /** Section 2, extended in place the way a continuation extends it. */
  const grown = () =>
    new Map([
      [1, "The first paragraph."],
      [2, "Ada opened the lock. She slid the letter under the floorboard."],
      [3, "Rain again."],
    ]);

  it("yields what was appended to the section it watermarked", () => {
    const a = assess(input({ watermark: seen(2), textBySection: grown() }));
    expect(a.newText).toContain("She slid the letter under the floorboard.");
    // ...and nothing that was already read.
    expect(a.newText).not.toContain("Ada opened the lock.");
  });

  it("counts the tail as unread prose", () => {
    const a = assess(input({ watermark: seen(2), textBySection: grown() }));
    expect(a.backlog).toBe(2); // the tail, plus section 3
  });

  it("joins the tail ahead of the sections that follow", () => {
    const a = assess(input({ watermark: seen(2), textBySection: grown() }));
    expect(a.newText).toBe(
      "She slid the letter under the floorboard.\n\nRain again.",
    );
  });

  it("offers the tail to candidate matching", () => {
    const a = assess(
      input({
        watermark: seen(2),
        textBySection: new Map([
          [1, "The first paragraph."],
          [2, "Ada opened the lock. Brennan was already inside."],
          [3, "Rain again."],
        ]),
      }),
    );
    // "Ada" is behind the watermark; only the tail's Brennan is new.
    expect(a.candidateIds).toEqual(["e2"]);
  });

  it("contributes nothing when the section has not grown", () => {
    const a = assess(input({ watermark: seen(2) }));
    expect(a.backlog).toBe(1);
    expect(a.newText).toBe("Rain again.");
  });

  it("contributes nothing when the section got SHORTER", () => {
    // The writer deleted text. `slice` past the end yields "", never a negative
    // window — but only if the slice is taken forwards.
    const a = assess(
      input({
        watermark: seen(2),
        textBySection: new Map([
          [1, "The first paragraph."],
          [2, "Ada opened"],
          [3, "Rain again."],
        ]),
      }),
    );
    expect(a.backlog).toBe(1);
    expect(a.newText).toBe("Rain again.");
  });

  it("yields only the tail when the watermarked section is the last one", () => {
    // The exact case the cheaper fix (watermark the second-to-last section)
    // still loses: the grown section is also the only new one.
    const a = assess(
      input({
        watermark: seen(3),
        textBySection: new Map([
          [1, "The first paragraph."],
          [2, "Ada opened the lock."],
          [3, "Rain again. And Ada ran."],
        ]),
      }),
    );
    expect(a.backlog).toBe(1);
    expect(a.newText).toBe("And Ada ran.");
    expect(a.candidateIds).toEqual(["e1"]);
  });
});

describe("assess — candidates", () => {
  it("names only entities the new prose actually mentions", () => {
    expect(assess(input({ watermark: seen(1) })).candidateIds).toEqual(["e1"]);
  });

  it("matches case-insensitively", () => {
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[2, "ADA arrived."]]),
      }),
    );
    expect(a.candidateIds).toEqual(["e1"]);
  });

  it("does not match a name inside a longer word", () => {
    // "Ada" must not fire on "Adamant" — a false candidate is cheap, but a
    // substring match makes short names fire on nearly everything.
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[2, "The adamant gate held."]]),
      }),
    );
    expect(a.candidateIds).toEqual([]);
  });

  it("ignores a mention that lives only in already-seen prose", () => {
    // Candidates describe what triage is being asked about, which is the new
    // prose alone. Matching against the whole document would hand triage the
    // same cast every pass.
    const a = assess(
      input({
        watermark: seen(2),
        textBySection: new Map([
          [1, "The first paragraph."],
          [2, "Brennan opened the lock."],
          [3, "Rain again."],
        ]),
      }),
    );
    expect(a.candidateIds).toEqual([]);
  });

  it("ignores an entity with a blank name", () => {
    const a = assess(
      input({ watermark: seen(1), entities: [entity("e3", "  ")] }),
    );
    expect(a.candidateIds).toEqual([]);
  });

  it("matches a name made of regex metacharacters", () => {
    // Names are user text. Unescaped, "C++" is a syntax error ("nothing to
    // repeat") and "(redacted)" is a capture group — one throws at runtime,
    // the other silently matches the wrong thing.
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[2, "She annotated the C++ manual."]]),
        entities: [entity("e4", "C++"), BRENNAN],
      }),
    );
    expect(a.candidateIds).toEqual(["e4"]);
  });

  it("matches a name whose edges are not word characters", () => {
    // A word boundary only exists between a word and a non-word character, so
    // demanding one on both sides of "(redacted)" can never match.
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[2, "The (redacted) file was open."]]),
        entities: [entity("e5", "(redacted)"), BRENNAN],
      }),
    );
    expect(a.candidateIds).toEqual(["e5"]);
  });

  it("still requires a whole word on the side that has one", () => {
    // "C++" keeps its left boundary, so it must not fire inside "ABC++".
    const a = assess(
      input({
        watermark: seen(1),
        textBySection: new Map([[2, "The ABC++ standard."]]),
        entities: [entity("e4", "C++")],
      }),
    );
    expect(a.candidateIds).toEqual([]);
  });
});
