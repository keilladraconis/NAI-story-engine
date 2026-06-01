import { describe, it, expect } from "vitest";
import {
  selectActiveForgeChatId,
  isForgeDraft,
} from "../../../../src/core/store/selectors/forge";
import type { RootState, WorldEntity } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";
import { FieldID } from "../../../../src/config/field-definitions";

function chat(over: Partial<Chat> = {}): Chat {
  return {
    id: "c",
    type: "brainstorm",
    title: "t",
    messages: [],
    seed: { kind: "blank" },
    ...over,
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
    expect(
      selectActiveForgeChatId(state([chat({ id: "b", type: "brainstorm" })])),
    ).toBeUndefined();
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

describe("isForgeDraft", () => {
  function entity(over: Partial<WorldEntity>): WorldEntity {
    return {
      id: "e",
      categoryId: FieldID.DramatisPersonae,
      name: "X",
      summary: "",
      lifecycle: "draft",
      ...over,
    } as WorldEntity;
  }

  it("is true for a draft with a sourceChatId (forge-originated)", () => {
    expect(
      isForgeDraft(entity({ lifecycle: "draft", sourceChatId: "fc-1" })),
    ).toBe(true);
  });

  it("is false for a manual draft with no sourceChatId", () => {
    expect(
      isForgeDraft(entity({ lifecycle: "draft", sourceChatId: undefined })),
    ).toBe(false);
  });

  it("is false for a live entity even if it has a sourceChatId", () => {
    expect(
      isForgeDraft(
        entity({
          lifecycle: "live",
          sourceChatId: "fc-1",
          lorebookEntryId: "lb-1",
        }),
      ),
    ).toBe(false);
  });
});
