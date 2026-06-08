import { describe, it, expect } from "vitest";
import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import { buildBrainstormPrompt } from "../../../src/core/utils/prompts";

describe("buildChatStrategy", () => {
  it("returns a strategy with chat target type for a saved chat", async () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: "hi" }],
      seed: { kind: "blank" },
    };
    const getState = () =>
      ({
        chat: { chats: [chat], activeChatId: chat.id, refineChat: null },
      }) as unknown as RootState;
    const strategy = await buildChatStrategy(getState, chat, "asst-id");
    expect(strategy.target).toEqual({
      type: "chat",
      chatId: chat.id,
      messageId: "asst-id",
    });
    expect(strategy.requestId).toContain(chat.id);
    // Saved chats auto-continue when the model hits max_tokens.
    expect(strategy.continuation).toEqual({ maxCalls: 5 });
  });

  it("returns a chatRefine target with refineContext applied for a refine chat", async () => {
    const refine: Chat = {
      id: "r1",
      type: "refine",
      title: "Refine",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "attg", sourceText: "old" },
      refineTarget: { fieldId: "attg", originalText: "old" },
    };
    const getState = () =>
      ({
        chat: { chats: [], activeChatId: null, refineChat: refine },
      }) as unknown as RootState;
    const strategy = await buildChatStrategy(getState, refine, "asst");
    expect(strategy.target).toEqual({
      type: "chatRefine",
      chatId: "r1",
      messageId: "asst",
      fieldId: "attg",
    });
    expect(strategy.requestId).toBe("refine-r1-asst");
  });

  it("manual continuation: keeps the existing assistant tail and switches prefillBehavior to keep", async () => {
    const assistantId = "asst-existing";
    const existingContent = "Half-written reply that hit the token cap.";
    const chat: Chat = {
      id: "c-cont",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [
        { id: "u1", role: "user", content: "go" },
        { id: assistantId, role: "assistant", content: existingContent },
      ],
      seed: { kind: "blank" },
    };
    const getState = () =>
      ({
        chat: { chats: [chat], activeChatId: chat.id, refineChat: null },
        foundation: {},
        world: { entitiesById: {}, entityIds: [] },
        brainstorm: {
          chats: [
            { id: "b1", title: "Brainstorm", messages: [], mode: "cowriter" },
          ],
          currentChatIndex: 0,
        },
      }) as unknown as RootState;
    const strategy = await buildChatStrategy(getState, chat, assistantId);
    expect(strategy.prefillBehavior).toBe("keep");
    expect(strategy.minResponseLength).toBeUndefined();
    const built = await strategy.messageFactory!();
    const messages = built.messages;
    // The existing assistant message survives as the tail of the transcript.
    const last = messages[messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toBe(existingContent);
    // No second assistant turn (i.e. no fresh chat-style prefill) is appended.
    const assistantTurns = messages.filter(
      (m: Message) => m.role === "assistant",
    );
    expect(assistantTurns).toHaveLength(1);
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
    const getState = () =>
      ({
        chat: { chats: [chat], activeChatId: chat.id, refineChat: null },
        foundation: {},
        world: { entitiesById: {}, entityIds: [] },
        brainstorm: {
          chats: [
            { id: "b1", title: "Brainstorm", messages: [], mode: "cowriter" },
          ],
          currentChatIndex: 0,
        },
      }) as unknown as RootState;
    const strategy = await buildChatStrategy(getState, chat, assistantId);
    const built = await strategy.messageFactory!();
    const messages = built.messages;
    // System message from spec is present
    expect(
      messages.some(
        (m: Message) =>
          m.role === "system" &&
          m.content === buildBrainstormPrompt("cowriter", "unset"),
      ),
    ).toBe(true);
    // The brainstorm generation must not inherit the entity-generation bundle.
    const allText = messages.map((m: Message) => m.content).join("\n");
    expect(allText).not.toContain("You are a Story Engine Agent");
    expect(allText).not.toContain("Possibility over Plot");
    expect(allText).not.toContain("Container Discipline");
    // First user message survives
    expect(
      messages.some(
        (m: Message) => m.role === "user" && m.content === "first user message",
      ),
    ).toBe(true);
    // The in-progress assistant placeholder is NOT in the assembled transcript
    expect(
      messages.every(
        (m: Message) => !(m.role === "assistant" && m.content === ""),
      ),
    ).toBe(true);
  });
});
