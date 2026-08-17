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

function input(over: Partial<Parameters<typeof assess>[0]> = {}) {
  return {
    sectionIds: [1, 2, 3],
    watermark: null,
    textBySection: new Map([
      [1, "The first paragraph."],
      [2, "Ada opened the lock."],
      [3, "Rain again."],
    ]),
    entities: [ADA, BRENNAN],
    ...over,
  };
}

describe("assess — backlog", () => {
  it("counts everything when there is no watermark yet", () => {
    expect(assess(input()).backlog).toBe(3);
  });

  it("counts only sections after the watermark", () => {
    expect(assess(input({ watermark: 1 })).backlog).toBe(2);
  });

  it("is zero when the watermark is the last section", () => {
    const a = assess(input({ watermark: 3 }));
    expect(a.backlog).toBe(0);
    expect(a.newText).toBe("");
  });

  it("treats a watermark that no longer exists as unseen", () => {
    // The writer undid past it, or deleted the paragraph. Re-reading is cheap
    // and safe; skipping prose because of a dangling id is not.
    expect(assess(input({ watermark: 99 })).backlog).toBe(3);
  });
});

describe("assess — newText", () => {
  it("joins the unseen sections in document order", () => {
    // This string is the volatile tail of the triage prompt, so order and
    // paragraph separation are the payload, not an implementation detail.
    expect(assess(input({ watermark: 1 })).newText).toBe(
      "Ada opened the lock.\n\nRain again.",
    );
  });

  it("skips sections the caller could not read", () => {
    const a = assess(
      input({
        watermark: 1,
        textBySection: new Map([[3, "Rain again."]]),
      }),
    );
    // Still two sections behind — a text we failed to read is not a section
    // we have seen — but only the text we have goes into the prompt.
    expect(a.backlog).toBe(2);
    expect(a.newText).toBe("Rain again.");
  });
});

describe("assess — candidates", () => {
  it("names only entities the new prose actually mentions", () => {
    expect(assess(input({ watermark: 1 })).candidateIds).toEqual(["e1"]);
  });

  it("matches case-insensitively", () => {
    const a = assess(
      input({ watermark: 1, textBySection: new Map([[2, "ADA arrived."]]) }),
    );
    expect(a.candidateIds).toEqual(["e1"]);
  });

  it("does not match a name inside a longer word", () => {
    // "Ada" must not fire on "Adamant" — a false candidate is cheap, but a
    // substring match makes short names fire on nearly everything.
    const a = assess(
      input({
        watermark: 1,
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
        watermark: 2,
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
    const a = assess(input({ watermark: 1, entities: [entity("e3", "  ")] }));
    expect(a.candidateIds).toEqual([]);
  });

  it("matches a name made of regex metacharacters", () => {
    // Names are user text. Unescaped, "C++" is a syntax error ("nothing to
    // repeat") and "(redacted)" is a capture group — one throws at runtime,
    // the other silently matches the wrong thing.
    const a = assess(
      input({
        watermark: 1,
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
        watermark: 1,
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
        watermark: 1,
        textBySection: new Map([[2, "The ABC++ standard."]]),
        entities: [entity("e4", "C++")],
      }),
    );
    expect(a.candidateIds).toEqual([]);
  });
});
