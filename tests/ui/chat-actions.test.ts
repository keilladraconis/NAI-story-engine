import { describe, it, expect } from "vitest";
import {
  decideFieldAction,
  hasScenarioContent,
  nextScenarioTitle,
  reusableScenarioId,
} from "../../src/ui/panels/chat/chat-actions";

describe("chat-actions", () => {
  it("decideFieldAction: empty / whitespace → generate", () => {
    expect(decideFieldAction("")).toBe("generate");
    expect(decideFieldAction("   \n\t ")).toBe("generate");
  });

  it("decideFieldAction: non-empty → refine", () => {
    expect(decideFieldAction("Author: X")).toBe("refine");
  });

  it("nextScenarioTitle counts only Scenario chats", () => {
    expect(nextScenarioTitle([])).toBe("Scenario 1");
    expect(nextScenarioTitle([{ type: "scenario" }, { type: "refine" }])).toBe(
      "Scenario 2",
    );
    expect(
      nextScenarioTitle([{ type: "scenario" }, { type: "scenario" }]),
    ).toBe("Scenario 3");
  });
});

describe("hasScenarioContent", () => {
  const chat = (type: string, n: number) => ({
    type,
    messages: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
  });

  it("is false with no chats at all", () => {
    expect(hasScenarioContent([])).toBe(false);
  });

  it("is false for a freshly minted, empty Scenario", () => {
    expect(hasScenarioContent([chat("scenario", 0)])).toBe(false);
  });

  it("is true once a Scenario carries a message", () => {
    expect(hasScenarioContent([chat("scenario", 1)])).toBe(true);
  });

  it("ignores non-Scenario chats that have messages", () => {
    expect(hasScenarioContent([chat("refine", 3), chat("summary", 2)])).toBe(
      false,
    );
  });

  it("finds content in any Scenario, not just the first", () => {
    expect(hasScenarioContent([chat("scenario", 0), chat("scenario", 2)])).toBe(
      true,
    );
  });
});

describe("reusableScenarioId", () => {
  // The store seeds an empty "Scenario 1" and selects it. "Plan the scenario"
  // minted a second chat regardless, so a writer's first click left them in
  // "Scenario 2" with "Scenario 1" sitting empty beside it in Sessions.
  // An empty chat that is already open is the chat to talk in.
  type C = { id: string; type: string; messages: unknown[] };

  const empty = (id: string, type = "scenario"): C => ({
    id,
    type,
    messages: [],
  });
  const talked = (id: string, type = "scenario"): C => ({
    id,
    type,
    messages: [{}],
  });

  it("reuses the selected Scenario when nothing has been said in it", () => {
    expect(reusableScenarioId([empty("b1")], "b1")).toBe("b1");
  });

  it("starts a new one when the selected Scenario has been talked in", () => {
    // Reusing it would append the new conversation to an old one.
    expect(reusableScenarioId([talked("b1")], "b1")).toBeNull();
  });

  it("never hijacks a chat of another type, even an empty one", () => {
    // A refine session with no turns yet is still a refine session: talking
    // into it would put Scenario messages in a chat whose type drives the
    // commit bar and the command parser.
    for (const type of ["brainstorm", "refine", "summary"]) {
      expect(reusableScenarioId([empty("x", type)], "x"), type).toBeNull();
    }
  });

  it("starts a new one when an empty Scenario exists but is not selected", () => {
    // Scoped to the selected chat on purpose. Reaching past it to adopt some
    // other empty session would move the writer somewhere they did not choose.
    expect(reusableScenarioId([empty("b1"), talked("b2")], "b2")).toBeNull();
  });

  it("starts a new one when nothing is selected, or the selection is stale", () => {
    expect(reusableScenarioId([empty("b1")], null)).toBeNull();
    expect(reusableScenarioId([empty("b1")], "gone")).toBeNull();
  });
});
