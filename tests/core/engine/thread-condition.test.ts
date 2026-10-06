import { describe, it, expect } from "vitest";
import {
  buildThreadCondition,
  THREAD_PRESENCE_RANGE_CHARS,
  type ThreadMember,
} from "../../../src/core/engine/thread-condition";

const key = (k: string) => ({
  type: "key",
  key: k,
  in: ["story"],
  range: THREAD_PRESENCE_RANGE_CHARS,
});

const member = (id: string, ...aliases: string[]): ThreadMember => ({
  id,
  aliases,
});

describe("a Thread is in context when its cast is on stage", () => {
  it("gives a cast-less Thread no condition at all", () => {
    expect(buildThreadCondition({ entityIds: [] }, [])).toBeNull();
  });

  it("probes for the one member of a single-member Thread", () => {
    expect(
      buildThreadCondition({ entityIds: ["a"] }, [member("a", "ines corbel")]),
    ).toEqual([key("ines corbel")]);
  });

  it("needs both members of a two-person Thread", () => {
    expect(
      buildThreadCondition({ entityIds: ["a", "b"] }, [
        member("a", "ines corbel"),
        member("b", "pell"),
      ]),
    ).toEqual([{ type: "and", conditions: [key("ines corbel"), key("pell")] }]);
  });

  it("needs any two members of a larger cast", () => {
    const [condition] = buildThreadCondition({ entityIds: ["a", "b", "c"] }, [
      member("a", "ines"),
      member("b", "pell"),
      member("c", "the cooperative"),
    ]) as LorebookCondition[];
    expect(condition).toEqual({
      type: "or",
      conditions: [
        { type: "and", conditions: [key("ines"), key("pell")] },
        { type: "and", conditions: [key("ines"), key("the cooperative")] },
        { type: "and", conditions: [key("pell"), key("the cooperative")] },
      ],
    });
  });

  it("treats any of a member's aliases as that member on stage", () => {
    expect(
      buildThreadCondition({ entityIds: ["a"] }, [
        member("a", "ines", "corbel", "Ines"),
      ]),
    ).toEqual([{ type: "or", conditions: [key("ines"), key("corbel")] }]);
  });

  it("skips a member nothing can name, and a member the World no longer holds", () => {
    expect(
      buildThreadCondition({ entityIds: ["a", "b", "gone"] }, [
        member("a", "ines"),
        member("b", " "),
      ]),
    ).toEqual([key("ines")]);
  });

  it("always emits exactly one condition", () => {
    const built = buildThreadCondition({ entityIds: ["a", "b"] }, [
      member("a", "ines"),
      member("b", "pell"),
    ]);
    expect(built).toHaveLength(1);
  });
});
