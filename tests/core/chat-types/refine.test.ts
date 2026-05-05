import { describe, it, expect, vi } from "vitest";
import { refineSpec } from "../../../src/core/chat-types/refine";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = { getState: vi.fn(), dispatch: vi.fn() };

const refineChat = (): Chat => ({
  id: "r1",
  type: "refine",
  title: "Refining: Intent",
  messages: [
    { id: "u1", role: "user", content: "make it tighter" },
    { id: "a1", role: "assistant", content: "tighter version", refineCandidate: true },
  ],
  seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
  refineTarget: { fieldId: "intent", originalText: "old" },
});

describe("refineSpec", () => {
  it("declares commit-discard lifecycle", () => {
    expect(refineSpec.lifecycle).toBe("commit-discard");
    expect(refineSpec.subModes).toBeUndefined();
  });

  it("initialize returns an empty transcript and refine title", () => {
    const init = refineSpec.initialize(
      { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
      ctx,
    );
    expect(init.title).toContain("intent");
    expect(init.initialMessages).toEqual([]);
  });

  it("systemPromptFor returns the refine instruction prompt", () => {
    expect(refineSpec.systemPromptFor(refineChat(), ctx)).toMatch(/rewriting/i);
  });

  it("contextSlice returns empty (refine never participates in SE prefix)", () => {
    expect(refineSpec.contextSlice(refineChat(), ctx)).toEqual([]);
  });

  it("headerControls is just the target label", () => {
    const controls = refineSpec.headerControls(refineChat(), ctx);
    expect(controls.map((c) => c.kind)).toEqual(["label"]);
  });
});
