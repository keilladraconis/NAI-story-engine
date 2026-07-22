import { describe, it, expect } from "vitest";
import {
  selectActiveForgeChatId,
  isForgeDraft,
  selectForgeNextPhase,
  selectForgeDraftPoolCount,
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
    forge: {
      tombstonesByChatId: {},
      pendingScrubByChatId: {},
      pinnedNextPhaseByChatId: {},
    },
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

function forgeState(opts: {
  subMode?: string;
  drafts?: number;
  pin?: "sketch" | "expand" | "weave";
}): RootState {
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
      chats: [chat({ id: "f1", type: "forge", subMode: opts.subMode ?? "sketch" })],
      activeChatId: "f1",
      refineChat: null,
    },
    world: { groups: [], entitiesById, entityIds: Object.keys(entitiesById) },
    forge: {
      tombstonesByChatId: {},
      pendingScrubByChatId: {},
      pinnedNextPhaseByChatId: opts.pin ? { f1: opts.pin } : {},
    },
  } as unknown as RootState;
}

describe("selectForgeDraftPoolCount", () => {
  it("counts draft entities for the chat", () => {
    expect(selectForgeDraftPoolCount(forgeState({ drafts: 2 }), "f1")).toBe(2);
    expect(selectForgeDraftPoolCount(forgeState({ drafts: 0 }), "f1")).toBe(0);
  });
});

describe("selectForgeNextPhase", () => {
  it("pool empty → sketch (even with a pin)", () => {
    expect(
      selectForgeNextPhase(forgeState({ drafts: 0, subMode: "expand", pin: "weave" }), "f1"),
    ).toBe("sketch");
  });

  it("pool non-empty, no pin → nextPhase(subMode)", () => {
    expect(
      selectForgeNextPhase(forgeState({ drafts: 1, subMode: "sketch" }), "f1"),
    ).toBe("expand");
  });

  it("pool non-empty, pinned → the pin", () => {
    expect(
      selectForgeNextPhase(forgeState({ drafts: 1, subMode: "sketch", pin: "weave" }), "f1"),
    ).toBe("weave");
  });
});
