import { describe, it, expect, vi, afterEach } from "vitest";
import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";
import type { RootState } from "../../../src/core/store/types";
import { buildBrainstormPrompt } from "../../../src/core/utils/prompts";
import { refineBudgetFor } from "../../../src/core/utils/refine-strategy";

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

  // A conversational reply is allowed to be short. The retry that
  // `minResponseLength` drives exists to catch Xialong returning an empty
  // `<think></think>` block and nothing else — it clears the visible message
  // and re-rolls up to three times, so any floor it enforces is a floor on
  // what the writer is allowed to receive. Set above a real co-writer turn it
  // discards good replies and re-rolls them in front of the writer.
  describe("the short-response floor in Xialong Mode", () => {
    afterEach(() => {
      vi.mocked(api.v1.config.get).mockReset();
    });

    function xialongOn(): void {
      vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
        key === "xialong_mode" ? true : undefined,
      );
    }

    // Real replies a brainstorm partner gives, and their lengths.
    const SHORT_REPLIES = [
      "Say more about the sister.", // 26
      "Which thread do you want first?", // 31
      "Cut the prologue.", // 17
    ];

    it("accepts a co-writer turn that is only a sentence long", async () => {
      xialongOn();
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

      const strategy = await buildChatStrategy(getState, chat, "asst");
      const floor = strategy.minResponseLength ?? 0;

      // The floor must sit under every one of these, or the writer watches a
      // real answer appear and vanish.
      expect(SHORT_REPLIES.length).toBeGreaterThan(0);
      for (const reply of SHORT_REPLIES) {
        expect(reply.length).toBeGreaterThanOrEqual(floor);
      }
    });

    it("still re-rolls an empty response", async () => {
      xialongOn();
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

      const strategy = await buildChatStrategy(getState, chat, "asst");

      // An empty <think></think> strips to "", which must still fail the floor.
      expect(strategy.minResponseLength).toBeGreaterThan(0);
    });
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
    // Refines auto-continue too — a rewrite cut off by the token cap used to
    // be committed mid-sentence.
    expect(strategy.continuation).toEqual({
      maxCalls: refineBudgetFor("attg").maxCalls,
    });
  });

  it("sizes a lorebook refine to the lorebook budget, not the short-field default", async () => {
    const refine: Chat = {
      id: "r2",
      type: "refine",
      title: "Refine",
      messages: [
        {
          id: "s",
          role: "system",
          content: "entry text",
          messageKind: "refineSource",
        },
      ],
      seed: {
        kind: "fromField",
        sourceFieldId: "lorebookContent",
        sourceText: "entry text",
      },
      refineTarget: {
        fieldId: "lorebookContent",
        originalText: "entry text",
        entryId: "e1",
      },
    };
    const getState = () =>
      ({
        chat: { chats: [], activeChatId: null, refineChat: refine },
        foundation: {},
        world: { entitiesById: {}, entityIds: [], threads: [] },
        brainstorm: { chats: [], currentChatIndex: 0 },
      }) as unknown as RootState;
    const budget = refineBudgetFor("lorebookContent");
    const strategy = await buildChatStrategy(getState, refine, "asst");
    expect(strategy.continuation).toEqual({ maxCalls: budget.maxCalls });
    const built = await strategy.messageFactory!();
    expect(built.params?.max_tokens).toBe(budget.maxTokens);
    expect(built.params?.stop).toEqual(budget.stop);
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
