import { describe, it, expect } from "vitest";
import {
  buildThreadCondition,
  threadSubjects,
  THREAD_RANGE_CHARS,
} from "../../../src/core/engine/thread-condition";
import { nameKey } from "../../../src/core/store/effects/handlers/lorebook";
import type { Thread, WorldEntity } from "../../../src/core/store/types";

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
      buildThreadCondition(big, [...CAST, entity("e3", "Céline")]),
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
    expect(threadSubjects(t, [...CAST, entity("e9", "Nobody")])).toEqual([
      "brennan",
      "ada",
    ]);
  });

  it("skips member ids no entity answers to", () => {
    const t = thread({ title: "", entityIds: ["e1", "ghost"] });
    expect(threadSubjects(t, CAST)).toEqual(["ada"]);
  });

  it("drops a nameless draft member rather than probing for nothing", () => {
    const draft: WorldEntity = {
      ...entity("e3", "   "),
      lifecycle: "draft",
    };
    const t = thread({ title: "", entityIds: ["e1", "e3"] });
    expect(threadSubjects(t, [...CAST, draft])).toEqual(["ada"]);
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
    const e = entity("e7", name);
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

  it("carries no pacing gate — no equation, no `and` — in this phase", () => {
    const json = JSON.stringify(
      buildThreadCondition(thread({ horizon: "arc" }), CAST),
    );
    expect(json).not.toContain('"equation"');
    expect(json).not.toContain("paragraphCount");
    expect(json).not.toContain('"and"');
  });

  it("builds the same condition for a satisfied thread — retirement is a flag flip", () => {
    expect(buildThreadCondition(thread({ status: "satisfied" }), CAST)).toEqual(
      buildThreadCondition(thread({ status: "open" }), CAST),
    );
  });
});
