import { describe, it, expect, vi } from "vitest";
import { summarySpec } from "../../../src/core/chat-types/summary";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = { getState: vi.fn(), dispatch: vi.fn() };

const chatWithMessages = (assistantContent: string): Chat => ({
  id: "s1",
  type: "summary",
  title: "Summary",
  messages: [{ id: "m1", role: "assistant", content: assistantContent }],
  seed: { kind: "fromChat", sourceChatId: "src" },
});

describe("summarySpec", () => {
  it("is a save-lifecycle type with no submodes", () => {
    expect(summarySpec.lifecycle).toBe("save");
    expect(summarySpec.subModes).toBeUndefined();
  });

  it("initialize from brainstorm seeds the source transcript as a system message", () => {
    const sourceMessages = [
      { id: "u1", role: "user" as const, content: "thoughts on noir" },
      { id: "a1", role: "assistant" as const, content: "noir is fun" },
    ];
    const localCtx: SpecCtx = {
      getState: () =>
        ({
          chat: {
            chats: [
              {
                id: "src",
                type: "brainstorm",
                title: "Source",
                messages: sourceMessages,
                seed: { kind: "blank" },
              },
            ],
            activeChatId: "src",
            refineChat: null,
          },
        }) as unknown as ReturnType<SpecCtx["getState"]>,
      dispatch: vi.fn(),
    };
    const init = summarySpec.initialize(
      { kind: "fromChat", sourceChatId: "src" },
      localCtx,
    );
    expect(init.initialMessages.length).toBeGreaterThan(0);
    expect(init.initialMessages[0].role).toBe("system");
    expect(init.initialMessages[0].content).toContain("noir is fun");
  });

  it("initialize from story text seeds the text as a system message", () => {
    const init = summarySpec.initialize(
      { kind: "fromStoryText", sourceText: "Once upon a time..." },
      ctx,
    );
    expect(init.initialMessages[0].content).toContain("Once upon a time");
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
