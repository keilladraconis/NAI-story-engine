import { describe, it, expect } from "vitest";
import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import { BRAINSTORM_PROMPT } from "../../../src/core/utils/prompts";

describe("buildChatStrategy", () => {
  it("returns a strategy with chat target type for a saved chat", () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: "hi" }],
      seed: { kind: "blank" },
    };
    const getState = (() =>
      ({ chat: { chats: [chat], activeChatId: chat.id, refineChat: null } }) as unknown as RootState);
    const strategy = buildChatStrategy(getState, chat, "asst-id");
    expect(strategy.target).toEqual({ type: "chat", chatId: chat.id, messageId: "asst-id" });
    expect(strategy.requestId).toContain(chat.id);
  });

  it("returns a chatRefine target with refineContext applied for a refine chat", () => {
    const refine: Chat = {
      id: "r1",
      type: "refine",
      title: "Refine",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "attg", sourceText: "old" },
      refineTarget: { fieldId: "attg", originalText: "old" },
    };
    const getState = (() =>
      ({ chat: { chats: [], activeChatId: null, refineChat: refine } }) as unknown as RootState);
    const strategy = buildChatStrategy(getState, refine, "asst");
    expect(strategy.target).toEqual({ type: "chatRefine", messageId: "asst", fieldId: "attg" });
    expect(strategy.requestId).toBe("refine-r1-asst");
  });

  it("messageFactory produces system + transcript without the in-progress assistant message", async () => {
    const assistantId = "asst-pending";
    const chat: Chat = {
      id: "c-mf",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [
        { id: "u1", role: "user", content: "first user message" },
        { id: assistantId, role: "assistant", content: "" },
      ],
      seed: { kind: "blank" },
    };
    const getState = (() =>
      ({
        chat: { chats: [chat], activeChatId: chat.id, refineChat: null },
        foundation: {},
        world: { entitiesById: {}, entityIds: [] },
        brainstorm: {
          chats: [{ id: "b1", title: "Brainstorm", messages: [], mode: "cowriter" }],
          currentChatIndex: 0,
        },
      }) as unknown as RootState);
    const strategy = buildChatStrategy(getState, chat, assistantId);
    const built = await strategy.messageFactory!();
    const messages = built.messages;
    // System message from spec is present
    expect(messages.some((m) => m.role === "system" && m.content === BRAINSTORM_PROMPT)).toBe(true);
    // First user message survives
    expect(messages.some((m) => m.role === "user" && m.content === "first user message")).toBe(true);
    // The in-progress assistant placeholder is NOT in the assembled transcript
    expect(messages.every((m) => !(m.role === "assistant" && m.content === ""))).toBe(true);
  });

  it("throws (or surfaces) when a refine targets a field with no registered strategy", () => {
    const refine: Chat = {
      id: "r2",
      type: "refine",
      title: "Refine",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
      refineTarget: { fieldId: "intent", originalText: "old" },
    };
    const getState = (() =>
      ({ chat: { chats: [], activeChatId: null, refineChat: refine } }) as unknown as RootState);
    // getFieldStrategy throws when fieldId is unknown — this propagates.
    expect(() => buildChatStrategy(getState, refine, "asst")).toThrow();
  });
});
