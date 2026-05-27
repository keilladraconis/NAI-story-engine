import { describe, it, expect } from "vitest";
import { buildRefineTail } from "../../../src/core/utils/refine-strategy";
import type { RefineContext } from "../../../src/core/chat-types/types";

describe("buildRefineTail", () => {
  const ctx = (history: RefineContext["history"] = []): RefineContext => ({
    fieldId: "intent",
    currentText: "current value",
    history,
  });

  it("emits a prose-boundary divider first, then the rewriting instruction", () => {
    const messages = buildRefineTail([], ctx());
    const dividerIdx = messages.findIndex((m) => m.role === "system" && m.content === "----");
    expect(dividerIdx).toBeGreaterThanOrEqual(0);
    expect(messages[dividerIdx + 1].role).toBe("system");
    expect(messages[dividerIdx + 1].content).toMatch(/rewriting/i);
  });

  it("includes the current field text labelled as the refine target", () => {
    const messages = buildRefineTail([], ctx());
    const sys = messages.find(
      (m) => m.role === "system" && m.content?.includes("current value"),
    );
    expect(sys).toBeDefined();
  });

  it("appends user/assistant turns from history in order", () => {
    const history = [
      { id: "u1", role: "user" as const, content: "tighter" },
      { id: "a1", role: "assistant" as const, content: "tightened" },
      { id: "u2", role: "user" as const, content: "shorter" },
    ];
    const messages = buildRefineTail([], ctx(history));
    const roles = messages.map((m) => m.role);
    expect(roles).toEqual(["system", "system", "system", "user", "assistant", "user"]);
  });

  it("filters out system messages from history", () => {
    const messages = buildRefineTail(
      [],
      ctx([{ id: "s1", role: "system" as const, content: "ignore me" }]),
    );
    expect(messages.find((m) => m.content === "ignore me")).toBeUndefined();
  });

  it("preserves base messages that are not a trailing [ Style: ] user anchor", () => {
    const base: Message[] = [
      { role: "system", content: "system-context" },
      { role: "system", content: "field-prompt" },
    ];
    const messages = buildRefineTail(base, ctx());
    expect(messages[0]).toEqual({ role: "system", content: "system-context" });
    expect(messages[1]).toEqual({ role: "system", content: "field-prompt" });
  });

  it("strips a trailing [ Style: ] user message from base messages", () => {
    const base: Message[] = [
      { role: "system", content: "field-prompt" },
      { role: "user", content: "[ Style: threshold-crossing, sardonic ]" },
    ];
    const messages = buildRefineTail(base, ctx());
    expect(messages.find((m) => m.content === "[ Style: threshold-crossing, sardonic ]")).toBeUndefined();
    expect(messages[0]).toEqual({ role: "system", content: "field-prompt" });
  });

  it("does not strip a trailing user message that is not a style anchor", () => {
    const base: Message[] = [
      { role: "system", content: "field-prompt" },
      { role: "user", content: "some regular user content" },
    ];
    const messages = buildRefineTail(base, ctx());
    expect(messages.find((m) => m.content === "some regular user content")).toBeDefined();
  });
});
