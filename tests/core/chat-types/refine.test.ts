import { describe, it, expect, vi, beforeEach } from "vitest";
import { refineSpec } from "../../../src/core/chat-types/refine";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";
import {
  attgUpdated,
  styleUpdated,
} from "../../../src/core/store/slices/foundation";

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

  describe("onCommit", () => {
    beforeEach(() => {
      vi.mocked(api.v1.ui.toast).mockClear();
    });

    const makeChat = (fieldId: string, lastAssistant = "rewritten"): Chat => ({
      id: "r1",
      type: "refine",
      title: `Refining: ${fieldId}`,
      messages: [
        { id: "u1", role: "user", content: "tighten it" },
        { id: "a0", role: "assistant", content: "" }, // empty draft, should be skipped
        { id: "a1", role: "assistant", content: lastAssistant, refineCandidate: true },
      ],
      seed: { kind: "fromField", sourceFieldId: fieldId, sourceText: "old" },
      refineTarget: { fieldId, originalText: "old" },
    });

    it("dispatches attgUpdated when committing an attg refine", () => {
      const dispatch = vi.fn();
      const localCtx: SpecCtx = { getState: vi.fn(), dispatch };
      refineSpec.onCommit?.(makeChat("attg", "new attg text"), localCtx);
      expect(dispatch).toHaveBeenCalledWith(attgUpdated({ attg: "new attg text" }));
    });

    it("dispatches styleUpdated when committing a style refine", () => {
      const dispatch = vi.fn();
      const localCtx: SpecCtx = { getState: vi.fn(), dispatch };
      refineSpec.onCommit?.(makeChat("style", "new style text"), localCtx);
      expect(dispatch).toHaveBeenCalledWith(styleUpdated({ style: "new style text" }));
    });

    it("toasts and bails when committing an unsupported field", () => {
      const dispatch = vi.fn();
      const localCtx: SpecCtx = { getState: vi.fn(), dispatch };
      refineSpec.onCommit?.(makeChat("intent", "x"), localCtx);
      expect(dispatch).not.toHaveBeenCalled();
      expect(api.v1.ui.toast).toHaveBeenCalledWith(
        expect.stringMatching(/intent/),
        expect.objectContaining({ type: "warning" }),
      );
    });

    it("returns silently when no candidate assistant message exists", () => {
      const dispatch = vi.fn();
      const localCtx: SpecCtx = { getState: vi.fn(), dispatch };
      const chat: Chat = {
        id: "r1",
        type: "refine",
        title: "Refining: attg",
        messages: [{ id: "u1", role: "user", content: "tighten it" }],
        seed: { kind: "fromField", sourceFieldId: "attg", sourceText: "old" },
        refineTarget: { fieldId: "attg", originalText: "old" },
      };
      refineSpec.onCommit?.(chat, localCtx);
      expect(dispatch).not.toHaveBeenCalled();
      expect(api.v1.ui.toast).not.toHaveBeenCalled();
    });
  });
});
