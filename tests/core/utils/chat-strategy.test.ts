import { describe, it, expect } from "vitest";
import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";

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
