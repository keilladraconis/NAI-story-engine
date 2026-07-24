import { describe, it, expect } from "vitest";
import {
  CHAT_INPUT_KEY,
  decideFieldAction,
  nextBrainstormTitle,
} from "../../src/ui/panels/chat/chat-actions";

describe("chat-actions", () => {
  it("CHAT_INPUT_KEY matches the effect's storyStorage key", () => {
    expect(CHAT_INPUT_KEY).toBe("se-bs-input");
  });

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
