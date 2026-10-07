import { describe, it, expect } from "vitest";
import {
  isForgeDraft,
  selectForgeDraftPoolCount,
} from "../../../../src/core/store/selectors/forge";
import type { RootState, WorldEntity } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";
import { FieldID } from "../../../../src/config/field-definitions";

function chat(over: Partial<Chat> = {}): Chat {
  return {
    id: "c",
    type: "scenario",
    title: "t",
    messages: [],
    seed: { kind: "blank" },
    ...over,
  };
}

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

  it("is true for a draft with a sourceChatId (Scenario-originated)", () => {
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

function forgeState(opts: { drafts?: number }): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (let i = 0; i < (opts.drafts ?? 0); i++) {
    entitiesById[`d${i}`] = {
      id: `d${i}`,
      categoryId: FieldID.DramatisPersonae,
      name: `D${i}`,
      summary: "",
      lifecycle: "draft",
      sourceChatId: "f1",
    } as WorldEntity;
  }
  return {
    chat: {
      chats: [chat({ id: "f1" })],
      activeChatId: "f1",
      refineChat: null,
    },
    world: { threads: [], entitiesById, entityIds: Object.keys(entitiesById) },
    forge: {
      tombstonesByChatId: {},
      pendingScrubByChatId: {},
    },
  } as unknown as RootState;
}

describe("selectForgeDraftPoolCount", () => {
  it("counts draft entities for the chat", () => {
    expect(selectForgeDraftPoolCount(forgeState({ drafts: 2 }), "f1")).toBe(2);
    expect(selectForgeDraftPoolCount(forgeState({ drafts: 0 }), "f1")).toBe(0);
  });
});
