import { describe, it, expect } from "vitest";
import {
  buildThreadCondition,
  threadSubjects,
  type ThreadMember,
} from "../../../src/core/engine/thread-condition";
import {
  THREAD_GRACE_PARAGRAPHS,
  THREAD_RANGE_CHARS,
} from "../../../src/core/engine/thread-horizon";
import { nameKey } from "../../../src/core/store/effects/handlers/lorebook";
import type { Thread, WorldEntity } from "../../../src/core/store/types";

/** A member as the CALLER must hand it over: an id and the name the member's
 *  lorebook entry is actually keyed on. Not a `WorldEntity` — that is the
 *  point of the signature (see below). */
function member(id: string, displayName: string): ThreadMember {
  return { id, displayName };
}

const ADA = member("e1", "Ada");
const BRENNAN = member("e2", "Brennan");
const CAST = [ADA, BRENNAN];

/** A thread as the Forge's [THREAD] command lands one: a prose title, a cast,
 *  and the reducer's defaults already applied (Task 1 — `horizon` and `status`
 *  are never undefined on a stored Thread). */
function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "The hidden letter",
    text: "Ada still has not told Brennan what the letter said.",
    horizon: "plot",
    entityIds: ["e1", "e2"],
    status: "open",
    anchorParagraph: null,
    ...over,
  };
}

// Narrowing helpers — the assertions are about the built structure, so each one
// walks the union rather than comparing against a snapshot string.

function unwrapNot(c: LorebookCondition): LorebookCondition {
  expect(c.type).toBe("not");
  if (c.type !== "not") throw new Error("not a `not`");
  return c.condition;
}

function asKey(c: LorebookCondition): LorebookAdvancedConditionKey {
  expect(c.type).toBe("key");
  if (c.type !== "key") throw new Error("not a `key`");
  return c;
}

function asOr(c: LorebookCondition): LorebookCondition[] {
  expect(c.type).toBe("or");
  if (c.type !== "or") throw new Error("not an `or`");
  return c.conditions;
}

function asAnd(c: LorebookCondition): LorebookCondition[] {
  expect(c.type).toBe("and");
  if (c.type !== "and") throw new Error("not an `and`");
  return c.conditions;
}

function asEquation(c: LorebookCondition): LorebookAdvancedConditionEquation {
  expect(c.type).toBe("equation");
  if (c.type !== "equation") throw new Error("not an `equation`");
  return c;
}

/** The detector and the gate, pulled apart from the one condition an anchored
 *  thread emits. */
function split(built: LorebookCondition[]): {
  detector: LorebookCondition;
  gate: LorebookCondition[];
} {
  const [detector, gate] = asAnd(only(built));
  return { detector, gate: asOr(gate) };
}

function only(cs: LorebookCondition[]): LorebookCondition {
  expect(cs).toHaveLength(1);
  return cs[0];
}

describe("buildThreadCondition — the shape", () => {
  it("is one condition: a `not` over key probes scoped to the story", () => {
    const built = buildThreadCondition(thread(), CAST);

    const probes = asOr(unwrapNot(only(built)));
    for (const probe of probes) {
      const key = asKey(probe);
      expect(key.in).toEqual(["story"]);
      expect(key.range).toBe(THREAD_RANGE_CHARS.plot);
    }
  });

  it("wraps a single subject directly, with no one-member `or`", () => {
    const built = buildThreadCondition(
      thread({ title: "", entityIds: ["e1"] }),
      CAST,
    );

    const key = asKey(unwrapNot(only(built)));
    expect(key.key).toBe("ada");
    expect(key.in).toEqual(["story"]);
  });

  it("returns exactly one condition however big the cast", () => {
    const big = thread({
      entityIds: ["e1", "e2", "e3"],
    });
    expect(
      buildThreadCondition(big, [...CAST, member("e3", "Céline")]),
    ).toHaveLength(1);
  });
});

describe("buildThreadCondition — range per horizon", () => {
  it("gives each horizon its own range, widening with scope", () => {
    const ranges = (["point", "plot", "arc"] as const).map((horizon) => {
      const key = asKey(
        asOr(
          unwrapNot(only(buildThreadCondition(thread({ horizon }), CAST))),
        )[0],
      );
      return key.range;
    });

    expect(ranges).toEqual([1000, 4000, 12000]);
    expect(new Set(ranges).size).toBe(3);
    expect(ranges[0]).toBeLessThan(ranges[1]);
    expect(ranges[1]).toBeLessThan(ranges[2]);
  });

  it("applies the same range to every probe in one thread", () => {
    const probes = asOr(
      unwrapNot(only(buildThreadCondition(thread({ horizon: "arc" }), CAST))),
    );
    expect(probes.map((p) => asKey(p).range)).toEqual([12000, 12000, 12000]);
  });
});

describe("threadSubjects — what the detector watches for", () => {
  it("watches the cast's names and the thread's own title", () => {
    // A realistic Forge title: prose, which is exactly why it cannot be the
    // only subject. It rides along; "ada"/"brennan" carry the detector.
    expect(threadSubjects(thread(), CAST)).toEqual([
      "the hidden letter",
      "ada",
      "brennan",
    ]);
  });

  it("keeps the thread's member order and ignores non-members", () => {
    const t = thread({ title: "", entityIds: ["e2", "e1"] });
    expect(threadSubjects(t, [...CAST, member("e9", "Nobody")])).toEqual([
      "brennan",
      "ada",
    ]);
  });

  it("skips member ids no entity answers to", () => {
    const t = thread({ title: "", entityIds: ["e1", "ghost"] });
    expect(threadSubjects(t, CAST)).toEqual(["ada"]);
  });

  it("drops a nameless draft member rather than probing for nothing", () => {
    const draft = member("e3", "   ");
    const t = thread({ title: "", entityIds: ["e1", "e3"] });
    expect(threadSubjects(t, [...CAST, draft])).toEqual(["ada"]);
  });

  it("probes the name the CALLER resolved, not a Redux name it went and found", () => {
    // CLAUDE.md's resolution order is DRAFT > LOREBOOK > STATE for exactly this
    // field: a writer who renames "Ada" to "Ada Lovelace" in their own lorebook
    // has moved the string the entry is keyed on, and Story Engine does not
    // chase that move — `entity.name` still says "Ada". The detector probes for
    // a mention, so it has to probe for the entry's name; the caller is the one
    // that can resolve it (`resolveDisplayName` is async, and this is pure).
    //
    // The signature is what enforces that. `WorldEntity` has `name`, not
    // `displayName`, so a phase-6 caller cannot hand this the world and get a
    // detector quietly watching for the wrong string — it gets a type error.
    const renamed = member("e1", "Ada Lovelace");
    const t = thread({ title: "", entityIds: ["e1"] });
    expect(threadSubjects(t, [renamed])).toEqual(["ada lovelace"]);

    const stale: WorldEntity = {
      id: "e1",
      categoryId: "dramatisPersonae" as WorldEntity["categoryId"],
      lifecycle: "live",
      name: "Ada",
      summary: "",
    };
    // Checked by `npx tsc --noEmit` (tests are in the project), not at runtime:
    // a `WorldEntity` has `name`, so it cannot stand in for a resolved member.
    // @ts-expect-error a WorldEntity is not a resolved subject
    const rejected: ThreadMember = stale;
    void rejected;
  });

  it("dedupes a title that repeats a member's name", () => {
    const t = thread({ title: "ADA", entityIds: ["e1"] });
    expect(threadSubjects(t, CAST)).toEqual(["ada"]);

    // and so the condition collapses to a single probe
    const key = asKey(unwrapNot(only(buildThreadCondition(t, CAST))));
    expect(key.key).toBe("ada");
  });
});

describe("threadSubjects — hostile names", () => {
  // `assess.ts` compiles a name into a RegExp and must escape it. This module
  // hands the string to NovelAI's matcher instead, so the key must be byte-for-
  // byte what the entity's own entry carries — escaping it here would search
  // for backslashes the entry does not have.
  const hostile = ["C++", "(redacted)", "/Ada/", "Kel$er [II]", "a|b"];

  it.each(hostile)("passes %s through as the entry's own key", (name) => {
    const e = member("e7", name);
    const t = thread({ title: "", entityIds: ["e7"] });

    const subjects = threadSubjects(t, [e]);
    expect(subjects).toEqual([nameKey(name)]);
    expect(subjects[0]).not.toContain("\\");

    const key = asKey(unwrapNot(only(buildThreadCondition(t, [e]))));
    expect(key.key).toBe(nameKey(name));
  });
});

describe("buildThreadCondition — threads with no cast", () => {
  it("still produces a usable condition from the title alone", () => {
    const t = thread({ entityIds: [] });

    const key = asKey(unwrapNot(only(buildThreadCondition(t, []))));
    expect(key.key).toBe("the hidden letter");
    expect(key.in).toEqual(["story"]);
    expect(key.range).toBe(THREAD_RANGE_CHARS.plot);
  });

  it("says always-on out loud when there is no subject at all", () => {
    const t = thread({ title: "   ", entityIds: [] });
    expect(buildThreadCondition(t, CAST)).toEqual([{ type: "true" }]);
  });
});

describe("buildThreadCondition — what it deliberately does not do", () => {
  it("never gates on a participant's entry being active", () => {
    const withEntries = [
      { ...ADA, lorebookEntryId: "lb1" },
      { ...BRENNAN, lorebookEntryId: "lb2" },
    ];
    const json = JSON.stringify(buildThreadCondition(thread(), withEntries));
    expect(json).not.toContain('"lore"');
    expect(json).not.toContain("lb1");
  });

  it("builds the same condition for a satisfied thread — retirement is a flag flip", () => {
    expect(buildThreadCondition(thread({ status: "satisfied" }), CAST)).toEqual(
      buildThreadCondition(thread({ status: "open" }), CAST),
    );
  });
});

describe("buildThreadCondition — the pacing gate (§4.3)", () => {
  it("leaves an unanchored thread exactly the shape phase 5 shipped", () => {
    // A thread the writer made by hand carries no anchor, so there is no
    // left-hand side to build an equation from. The detector alone, and no
    // `and` wrapping it.
    const json = JSON.stringify(
      buildThreadCondition(thread({ anchorParagraph: null }), CAST),
    );
    expect(json).not.toContain('"equation"');
    expect(json).not.toContain("paragraphCount");
    expect(json).not.toContain('"and"');
  });

  it("gates an anchored thread on its own anchor, not a global stripe", () => {
    const { detector, gate } = split(
      buildThreadCondition(thread({ anchorParagraph: 120 }), CAST),
    );

    // The detector survives untouched underneath: the title and both members.
    expect(asOr(unwrapNot(detector))).toHaveLength(3);

    const [grace, behind] = gate.map(asEquation);
    expect(grace.comparison).toBe(">=");
    expect(grace.target).toBe(120 + THREAD_GRACE_PARAGRAPHS.plot);
    expect(behind.comparison).toBe("<");
    expect(behind.target).toBe(120);
  });

  it("is silent for one of the thread's own forgetting windows", () => {
    // The grace is the horizon's range, in paragraphs — the window the
    // detector itself looks back over. Not a number of its own.
    const cases: [Thread["horizon"], number][] = [
      ["point", 3],
      ["plot", 10],
      ["arc", 30],
    ];
    for (const [horizon, grace] of cases) {
      expect(THREAD_GRACE_PARAGRAPHS[horizon]).toBe(grace);
      const { gate } = split(
        buildThreadCondition(thread({ horizon, anchorParagraph: 40 }), CAST),
      );
      expect(asEquation(gate[0]).target).toBe(40 + grace);
    }
  });

  it("opens the gate when the count is behind the anchor — never silence", () => {
    // Undo does not revert the stored condition (§7), so an entry can be left
    // carrying an anchor ahead of the branch it is now on. Without this
    // disjunct that thread's reminder is switched off forever; with it the
    // thread degrades to the always-on it had before the gate.
    const { gate } = split(
      buildThreadCondition(thread({ anchorParagraph: 900 }), CAST),
    );
    const behind = asEquation(gate[1]);
    expect(behind.terms).toEqual([{ value: "paragraphCount" }]);
    expect(behind.comparison).toBe("<");
    expect(behind.target).toBe(900);
  });

  it("does the arithmetic at build time — one term, no operator", () => {
    // `terms` is an array and the `.d.ts` never says how a term's operator
    // binds. The anchor is a literal, so the subtraction is done here and each
    // equation is the single-term shape the `.d.ts`'s own example documents.
    const { gate } = split(
      buildThreadCondition(thread({ anchorParagraph: 7 }), CAST),
    );
    for (const equation of gate.map(asEquation)) {
      expect(equation.terms).toHaveLength(1);
      expect(equation.terms[0].value).toBe("paragraphCount");
      expect(equation.terms[0].operator).toBeUndefined();
      expect(typeof equation.target).toBe("number");
    }
  });

  it("gates a title-only thread too", () => {
    const { detector, gate } = split(
      buildThreadCondition(thread({ entityIds: [], anchorParagraph: 5 }), CAST),
    );
    expect(asKey(unwrapNot(detector)).key).toBe("the hidden letter");
    expect(gate).toHaveLength(2);
  });

  it("is the whole condition when there is no subject to probe for", () => {
    // The `{type: "true"}` case, anchored: nothing to negate, so the gate is
    // all there is — and it still says "not yet" rather than "always".
    const built = buildThreadCondition(
      thread({ title: "   ", entityIds: [], anchorParagraph: 60 }),
      CAST,
    );
    const gate = asOr(only(built));
    expect(asEquation(gate[0]).target).toBe(70);
  });

  it("gates an anchored thread of every horizon, not only arcs", () => {
    // §4.3 frames the gate as arc-only, and as built that would be inert: the
    // Engine's `open` passes no horizon, so every thread it anchors is a
    // `plot`, and every arc is hand-made and unanchored.
    for (const horizon of ["point", "plot", "arc"] as const) {
      const built = buildThreadCondition(
        thread({ horizon, anchorParagraph: 12 }),
        CAST,
      );
      expect(JSON.stringify(built)).toContain("paragraphCount");
    }
  });
});
