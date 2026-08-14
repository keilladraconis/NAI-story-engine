import { describe, it, expect } from "vitest";
import {
  decideFieldAction,
  hasBrainstormContent,
  nextBrainstormTitle,
} from "../../src/ui/panels/chat/chat-actions";

describe("chat-actions", () => {
  it("decideFieldAction: empty / whitespace → generate", () => {
    expect(decideFieldAction("")).toBe("generate");
    expect(decideFieldAction("   \n\t ")).toBe("generate");
  });

  it("decideFieldAction: non-empty → refine", () => {
    expect(decideFieldAction("Author: X")).toBe("refine");
  });

  it("nextBrainstormTitle counts only brainstorm chats", () => {
    expect(nextBrainstormTitle([])).toBe("Brainstorm 1");
    expect(
      nextBrainstormTitle([{ type: "brainstorm" }, { type: "refine" }]),
    ).toBe("Brainstorm 2");
    expect(
      nextBrainstormTitle([{ type: "brainstorm" }, { type: "brainstorm" }]),
    ).toBe("Brainstorm 3");
  });
});

describe("hasBrainstormContent", () => {
  const chat = (type: string, n: number) => ({
    type,
    messages: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
  });

  it("is false with no chats at all", () => {
    expect(hasBrainstormContent([])).toBe(false);
  });

  it("is false for a freshly minted, empty brainstorm", () => {
    expect(hasBrainstormContent([chat("brainstorm", 0)])).toBe(false);
  });

  it("is true once a brainstorm carries a message", () => {
    expect(hasBrainstormContent([chat("brainstorm", 1)])).toBe(true);
  });

  it("ignores non-brainstorm chats that have messages", () => {
    expect(hasBrainstormContent([chat("refine", 3), chat("forge", 2)])).toBe(
      false,
    );
  });

  it("finds content in any brainstorm, not just the first", () => {
    expect(
      hasBrainstormContent([chat("brainstorm", 0), chat("brainstorm", 2)]),
    ).toBe(true);
  });
});
