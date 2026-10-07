import { describe, it, expect, vi } from "vitest";
import { summarySpec } from "../../../src/core/chat-types/summary";
import { STORY_TEXT_SUMMARIZE_PROMPT } from "../../../src/core/utils/prompts";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = { getState: vi.fn(), dispatch: vi.fn() };

const chatWithMessages = (assistantContent: string): Chat => ({
  id: "s1",
  type: "summary",
  title: "Summary",
  messages: [{ id: "m1", role: "assistant", content: assistantContent }],
  seed: { kind: "fromStoryText", sourceText: "src" },
});

describe("summarySpec", () => {
  it("is a save-lifecycle type with no submodes", () => {
    expect(summarySpec.lifecycle).toBe("save");
    expect(summarySpec.subModes).toBeUndefined();
  });

  it("initialize from story text seeds the text as a system message", () => {
    const init = summarySpec.initialize(
      { kind: "fromStoryText", sourceText: "Once upon a time..." },
      ctx,
    );
    expect(init.initialMessages[0].content).toContain("Once upon a time");
  });

  it("always summarizes with the story-text prompt", () => {
    expect(summarySpec.systemPromptFor(chatWithMessages("x"), ctx)).toBe(
      STORY_TEXT_SUMMARIZE_PROMPT,
    );
  });

  it("contextSlice returns only the last assistant turn", () => {
    const chat = chatWithMessages("the latest summary");
    chat.messages.unshift({ id: "old", role: "assistant", content: "older" });
    const sliced = summarySpec.contextSlice(chat, ctx);
    expect(sliced).toHaveLength(1);
    expect(sliced[0].content).toBe("the latest summary");
  });

  it("contextSlice returns empty when no assistant turn exists", () => {
    const chat = chatWithMessages("ok");
    chat.messages = [{ id: "u", role: "user", content: "hi" }];
    expect(summarySpec.contextSlice(chat, ctx)).toEqual([]);
  });
});
