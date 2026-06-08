import { describe, it, expect, vi } from "vitest";
import { brainstormSpec } from "../../../src/core/chat-types/brainstorm";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";
import { buildBrainstormPrompt } from "../../../src/core/utils/prompts";
import type { IntensityData, RootState } from "../../../src/core/store/types";

const ctxWith = (intensity: IntensityData | null): SpecCtx => ({
  getState: vi.fn(() => ({ foundation: { intensity } }) as unknown as RootState),
  dispatch: vi.fn(),
});

const ctx: SpecCtx = ctxWith(null);

const brainstormChat = (subMode: "cowriter" | "critic" = "cowriter"): Chat => ({
  id: "c1",
  type: "brainstorm",
  title: "Brainstorm 1",
  subMode,
  messages: [
    { id: "m1", role: "user", content: "hi" },
    { id: "m2", role: "assistant", content: "hello" },
  ],
  seed: { kind: "blank" },
});

describe("brainstormSpec", () => {
  it("declares save lifecycle and cowriter/critic submodes", () => {
    expect(brainstormSpec.lifecycle).toBe("save");
    expect(brainstormSpec.subModes).toContain("cowriter");
    expect(brainstormSpec.subModes).toContain("critic");
    expect(brainstormSpec.defaultSubMode).toBe("cowriter");
  });

  it("initialize seeds an empty cowriter brainstorm", () => {
    const init = brainstormSpec.initialize({ kind: "blank" }, ctx);
    expect(init.title).toMatch(/Brainstorm/);
    expect(init.subMode).toBe("cowriter");
    expect(init.initialMessages).toEqual([]);
  });

  it("systemPromptFor switches by subMode", () => {
    const co = brainstormSpec.systemPromptFor(brainstormChat("cowriter"), ctx);
    const cr = brainstormSpec.systemPromptFor(brainstormChat("critic"), ctx);
    expect(co).not.toEqual(cr);
    expect(co.length).toBeGreaterThan(0);
    expect(cr.length).toBeGreaterThan(0);
  });

  it("systemPromptFor selects the register from foundation.intensity", () => {
    const cozyCtx = ctxWith({ level: "Cozy", description: "" });
    expect(
      brainstormSpec.systemPromptFor(brainstormChat("cowriter"), cozyCtx),
    ).toBe(buildBrainstormPrompt("cowriter", "Cozy"));
    expect(
      brainstormSpec.systemPromptFor(brainstormChat("critic"), cozyCtx),
    ).toBe(buildBrainstormPrompt("critic", "Cozy"));

    const nightmareCtx = ctxWith({ level: "Nightmare", description: "" });
    expect(
      brainstormSpec.systemPromptFor(brainstormChat("critic"), nightmareCtx),
    ).toBe(buildBrainstormPrompt("critic", "Nightmare"));
  });

  it("systemPromptFor falls back to the unset register when no intensity is set", () => {
    expect(
      brainstormSpec.systemPromptFor(brainstormChat("cowriter"), ctxWith(null)),
    ).toBe(buildBrainstormPrompt("cowriter", "unset"));
  });

  it("contextSlice returns the full transcript", () => {
    const chat = brainstormChat();
    expect(brainstormSpec.contextSlice(chat, ctx)).toEqual(chat.messages);
  });

  it("headerControls includes sessions, sub-mode toggle, and summarize", () => {
    const controls = brainstormSpec.headerControls(brainstormChat(), ctx);
    const kinds = controls.map((c) => c.kind);
    expect(kinds).toContain("sessionsButton");
    expect(kinds).toContain("subModeToggle");
    expect(kinds).toContain("summarizeButton");
  });
});
