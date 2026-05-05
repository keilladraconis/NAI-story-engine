import { describe, it, expect } from "vitest";
import { buildRefineTail } from "../../../src/core/utils/refine-strategy";
import type { RefineContext } from "../../../src/core/chat-types/types";

describe("buildRefineTail", () => {
  const ctx = (history: RefineContext["history"] = []): RefineContext => ({
    fieldId: "intent",
    currentText: "current value",
    history,
  });

  it("emits a system instruction first", () => {
    const tail = buildRefineTail(ctx());
    expect(tail[0].role).toBe("system");
    expect(tail[0].content).toMatch(/rewriting/i);
  });

  it("includes the current field text labelled as the refine target", () => {
    const tail = buildRefineTail(ctx());
    const sys = tail.find(
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
    const tail = buildRefineTail(ctx(history));
    const tailRoles = tail.map((m) => m.role);
    expect(tailRoles).toEqual(["system", "system", "user", "assistant", "user"]);
  });

  it("filters out system messages from history", () => {
    const tail = buildRefineTail(
      ctx([{ id: "s1", role: "system" as const, content: "ignore me" }]),
    );
    expect(tail.find((m) => m.content === "ignore me")).toBeUndefined();
  });
});
