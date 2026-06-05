import { describe, it, expect } from "vitest";
import {
  chatSliceReducer,
  initialChatState,
  chatCreated,
  chatRenamed,
  chatSwitched,
  chatDeleted,
  subModeChanged,
  messageAdded,
  messageUpdated,
  messageAppended,
  messageRemoved,
  messagesPrunedAfter,
  refineCandidateMarked,
} from "../../../../src/core/store/slices/chat";
import type { Chat } from "../../../../src/core/chat-types/types";

const blankChat = (over: Partial<Chat> = {}): Chat => ({
  id: "c1",
  type: "brainstorm",
  title: "Test",
  subMode: "cowriter",
  messages: [],
  seed: { kind: "blank" },
  ...over,
});

describe("chat slice", () => {
  it("starts with one default brainstorm chat", () => {
    expect(initialChatState.chats.length).toBe(1);
    expect(initialChatState.chats[0].type).toBe("brainstorm");
    expect(initialChatState.activeChatId).toBe(initialChatState.chats[0].id);
  });

  it("chatCreated appends and switches to the new chat", () => {
    const start = { ...initialChatState };
    const next = chatSliceReducer(
      start,
      chatCreated({ chat: blankChat({ id: "c2" }) }),
    );
    expect(next.chats.length).toBe(2);
    expect(next.activeChatId).toBe("c2");
  });

  it("chatRenamed updates only the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a" }), blankChat({ id: "b", title: "B" })],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      chatRenamed({ id: "b", title: "renamed" }),
    );
    expect(next.chats[0].title).toBe("Test");
    expect(next.chats[1].title).toBe("renamed");
  });

  it("chatSwitched updates activeChatId only when the id exists", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
    };
    expect(
      chatSliceReducer(start, chatSwitched({ id: "missing" })).activeChatId,
    ).toBe("a");
    expect(
      chatSliceReducer(
        { ...start, chats: [...start.chats, blankChat({ id: "b" })] },
        chatSwitched({ id: "b" }),
      ).activeChatId,
    ).toBe("b");
  });

  it("chatDeleted refuses to remove the last chat", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
    };
    const next = chatSliceReducer(start, chatDeleted({ id: "a" }));
    expect(next.chats.length).toBe(1);
  });

  it("chatDeleted removes a chat and repoints activeChatId", () => {
    const start = {
      chats: [blankChat({ id: "a" }), blankChat({ id: "r1", type: "refine" })],
      activeChatId: "r1",
    };
    const next = chatSliceReducer(start, chatDeleted({ id: "r1" }));
    expect(next.chats.map((c) => c.id)).toEqual(["a"]);
    expect(next.activeChatId).toBe("a");
  });

  it("subModeChanged mutates only the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a", subMode: "cowriter" })],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      subModeChanged({ id: "a", subMode: "critic" }),
    );
    expect(next.chats[0].subMode).toBe("critic");
  });

  it("messageAdded appends to the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      messageAdded({
        chatId: "a",
        message: { id: "m1", role: "user", content: "hi" },
      }),
    );
    expect(next.chats[0].messages).toHaveLength(1);
    expect(next.chats[0].messages[0].content).toBe("hi");
  });

  it("messageAppended concatenates content for streaming", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [{ id: "m1", role: "assistant", content: "Hel" }],
        }),
      ],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      messageAppended({ chatId: "a", id: "m1", content: "lo" }),
    );
    expect(next.chats[0].messages[0].content).toBe("Hello");
  });

  it("messageUpdated overwrites content", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [{ id: "m1", role: "assistant", content: "wrong" }],
        }),
      ],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      messageUpdated({ chatId: "a", id: "m1", content: "right" }),
    );
    expect(next.chats[0].messages[0].content).toBe("right");
  });

  it("messageRemoved drops the matching message", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [
            { id: "m1", role: "user", content: "x" },
            { id: "m2", role: "assistant", content: "y" },
          ],
        }),
      ],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      messageRemoved({ chatId: "a", id: "m1" }),
    );
    expect(next.chats[0].messages).toHaveLength(1);
    expect(next.chats[0].messages[0].id).toBe("m2");
  });

  it("messagesPrunedAfter trims after the user message inclusive of it", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [
            { id: "m1", role: "user", content: "u1" },
            { id: "m2", role: "assistant", content: "a1" },
            { id: "m3", role: "user", content: "u2" },
            { id: "m4", role: "assistant", content: "a2" },
          ],
        }),
      ],
      activeChatId: "a",
    };
    const next = chatSliceReducer(
      start,
      messagesPrunedAfter({ chatId: "a", id: "m3" }),
    );
    expect(next.chats[0].messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("refineCandidateMarked flips the flag on the targeted chat message", () => {
    const start = {
      chats: [
        blankChat({
          id: "r1",
          type: "refine",
          messages: [{ id: "m1", role: "assistant", content: "draft" }],
        }),
      ],
      activeChatId: "r1",
    };
    const next = chatSliceReducer(
      start,
      refineCandidateMarked({ chatId: "r1", messageId: "m1" }),
    );
    expect(next.chats[0].messages[0].refineCandidate).toBe(true);
  });
});
