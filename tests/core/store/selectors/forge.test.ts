import { describe, it, expect } from "vitest";
import { selectActiveForgeChatId } from "../../../../src/core/store/selectors/forge";
import type { RootState } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";

function chat(over: Partial<Chat> = {}): Chat {
  return {
    id: "c", type: "brainstorm", title: "t", messages: [], seed: { kind: "blank" }, ...over,
  };
}

function state(chats: Chat[]): RootState {
  return {
    chat: { chats, activeChatId: null, refineChat: null },
    world: { groups: [], entitiesById: {}, entityIds: [] },
    forge: { tombstonesByChatId: {} },
  } as unknown as RootState;
}

describe("selectActiveForgeChatId", () => {
  it("returns undefined when no forge chats exist", () => {
    expect(selectActiveForgeChatId(state([chat({ id: "b", type: "brainstorm" })]))).toBeUndefined();
  });

  it("returns the most-recently-added forge chat id", () => {
    const s = state([
      chat({ id: "b", type: "brainstorm" }),
      chat({ id: "f1", type: "forge" }),
      chat({ id: "f2", type: "forge" }),
    ]);
    expect(selectActiveForgeChatId(s)).toBe("f2");
  });
});
