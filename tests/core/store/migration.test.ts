import { describe, it, expect } from "vitest";
import { migrateBrainstormToChat } from "../../../src/core/store/migrations/brainstorm-to-chat";
import type { ChatMessage } from "../../../src/core/chat-types/types";

describe("migrateBrainstormToChat", () => {
  it("converts v0.11 brainstorm.chats to chat slice shape", () => {
    const v11 = {
      brainstorm: {
        chats: [
          {
            id: "c1",
            title: "Brainstorm 1",
            mode: "cowriter",
            messages: [{ id: "m1", role: "user" as const, content: "hi" }] as ChatMessage[],
          },
          {
            id: "c2",
            title: "Brainstorm 2",
            mode: "critic",
            messages: [] as ChatMessage[],
          },
        ],
        currentChatIndex: 1,
      },
    };
    const result = migrateBrainstormToChat(v11);
    expect(result.touched).toBe(true);
    expect(result.data.brainstorm).toBeUndefined();
    expect(result.data.chat).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chat = result.data.chat!;
    expect(chat.chats).toHaveLength(2);
    expect(chat.chats[0]).toMatchObject({
      id: "c1",
      type: "brainstorm",
      title: "Brainstorm 1",
      subMode: "cowriter",
    });
    expect(chat.chats[1].subMode).toBe("critic");
    expect(chat.activeChatId).toBe("c2");
    expect(chat.refineChat).toBeNull();
  });

  it("is idempotent: running on already-migrated data is a no-op", () => {
    const already = {
      chat: {
        chats: [
          {
            id: "c1",
            type: "brainstorm",
            title: "x",
            subMode: "cowriter",
            messages: [] as ChatMessage[],
            seed: { kind: "blank" as const },
          },
        ],
        activeChatId: "c1",
        refineChat: null,
      },
    };
    const result = migrateBrainstormToChat(already);
    expect(result.touched).toBe(false);
    expect(result.data).toEqual(already);
  });

  it("handles empty input by returning unchanged data", () => {
    const empty = {};
    const result = migrateBrainstormToChat(empty);
    expect(result.touched).toBe(false);
    expect(result.data).toEqual(empty);
  });

  it("falls back to first chat when currentChatIndex is out of range", () => {
    const v11 = {
      brainstorm: {
        chats: [{ id: "c1", title: "x", mode: "cowriter", messages: [] as ChatMessage[] }],
        currentChatIndex: 7,
      },
    };
    const result = migrateBrainstormToChat(v11);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.data.chat!.activeChatId).toBe("c1");
  });
});
