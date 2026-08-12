import { describe, it, expect } from "vitest";
import {
  buildRefineTail,
  refineBudgetFor,
} from "../../../src/core/utils/refine-strategy";
import { LOREBOOK_CHAIN_STOPS } from "../../../src/core/utils/config";
import type { RefineContext } from "../../../src/core/chat-types/types";

describe("buildRefineTail", () => {
  const ctx = (history: RefineContext["history"] = []): RefineContext => ({
    fieldId: "intent",
    currentText: "current value",
    history,
  });

  it("emits a prose-boundary divider first, then the rewriting instruction", () => {
    const messages = buildRefineTail([], ctx());
    const dividerIdx = messages.findIndex(
      (m) => m.role === "system" && m.content === "----",
    );
    expect(dividerIdx).toBeGreaterThanOrEqual(0);
    expect(messages[dividerIdx + 1].role).toBe("system");
    expect(messages[dividerIdx + 1].content).toMatch(/rewrite/i);
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
    expect(roles).toEqual([
      "system",
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
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
    expect(
      messages.find(
        (m) => m.content === "[ Style: threshold-crossing, sardonic ]",
      ),
    ).toBeUndefined();
    expect(messages[0]).toEqual({ role: "system", content: "field-prompt" });
  });

  it("does not strip a trailing user message that is not a style anchor", () => {
    const base: Message[] = [
      { role: "system", content: "field-prompt" },
      { role: "user", content: "some regular user content" },
    ];
    const messages = buildRefineTail(base, ctx());
    expect(
      messages.find((m) => m.content === "some regular user content"),
    ).toBeDefined();
  });
});

describe("refineBudgetFor", () => {
  it("gives every field enough calls to finish a truncated rewrite", () => {
    for (const fieldId of [
      "attg",
      "style",
      "intent",
      "contract",
      "lorebookContent",
    ]) {
      expect(refineBudgetFor(fieldId).maxCalls).toBeGreaterThan(1);
    }
  });

  it("budgets a lorebook rewrite past the 1024 tokens the entry was written at", () => {
    // A single 400-token call is what truncated lorebook rewrites mid-sentence.
    const { maxTokens, maxCalls } = refineBudgetFor("lorebookContent");
    expect(maxTokens * maxCalls).toBeGreaterThan(1024);
  });

  it("uses lorebook chain stops for lorebook content, not the bracket stop", () => {
    // `]\n` cuts prose containing a legitimate bracketed clause.
    const { stop } = refineBudgetFor("lorebookContent");
    expect(stop).toEqual(LOREBOOK_CHAIN_STOPS);
    expect(stop).not.toContain("]\n");
  });

  it("falls back to the default budget for unknown fields", () => {
    expect(refineBudgetFor("nope")).toEqual(refineBudgetFor("attg"));
  });
});
