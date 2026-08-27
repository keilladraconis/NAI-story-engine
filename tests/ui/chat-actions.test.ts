import { describe, it, expect } from "vitest";
import {
  decideFieldAction,
  hasBrainstormContent,
  nextBrainstormTitle,
  reusableBrainstormId,
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

describe("reusableBrainstormId", () => {
  // The store seeds an empty "Brainstorm 1" and selects it. "Talk it through"
  // minted a second chat regardless, so a writer's first click left them in
  // "Brainstorm 2" with "Brainstorm 1" sitting empty beside it in Sessions.
  // An empty chat that is already open is the chat to talk in.
  type C = { id: string; type: string; messages: unknown[] };

  const empty = (id: string, type = "brainstorm"): C => ({
    id,
    type,
    messages: [],
  });
  const talked = (id: string, type = "brainstorm"): C => ({
    id,
    type,
    messages: [{}],
  });

  it("reuses the selected brainstorm when nothing has been said in it", () => {
    expect(reusableBrainstormId([empty("b1")], "b1")).toBe("b1");
  });

  it("starts a new one when the selected brainstorm has been talked in", () => {
    // Reusing it would append the new conversation to an old one.
    expect(reusableBrainstormId([talked("b1")], "b1")).toBeNull();
  });

  it("never hijacks a chat of another type, even an empty one", () => {
    // A forge session with no turns yet is still a forge session: talking into
    // it would put brainstorm messages in a chat whose type drives the phase
    // pills, the commit bar and the command parser.
    for (const type of ["forge", "refine", "summary"]) {
      expect(reusableBrainstormId([empty("x", type)], "x"), type).toBeNull();
    }
  });

  it("starts a new one when an empty brainstorm exists but is not selected", () => {
    // Scoped to the selected chat on purpose. Reaching past it to adopt some
    // other empty session would move the writer somewhere they did not choose.
    expect(reusableBrainstormId([empty("b1"), talked("b2")], "b2")).toBeNull();
  });

  it("starts a new one when nothing is selected, or the selection is stale", () => {
    expect(reusableBrainstormId([empty("b1")], null)).toBeNull();
    expect(reusableBrainstormId([empty("b1")], "gone")).toBeNull();
  });
});
