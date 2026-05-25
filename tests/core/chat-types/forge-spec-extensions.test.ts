import { describe, it, expect, vi } from "vitest";
import { forgeSpec } from "../../../src/core/chat-types/forge";
import type { Chat, ChatMessage, SpecCtx } from "../../../src/core/chat-types/types";
import type { RootState, WorldEntity } from "../../../src/core/store/types";
import { FieldID } from "../../../src/config/field-definitions";

function entity(over: Partial<WorldEntity>): WorldEntity {
  return {
    id: "e", categoryId: FieldID.DramatisPersonae,
    name: "X", summary: "", lifecycle: "draft", ...over,
  } as WorldEntity;
}

function stateWith(entities: WorldEntity[]): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const e of entities) entitiesById[e.id] = e;
  return {
    chat: { chats: [], activeChatId: null, refineChat: null },
    world: {
      groups: [], entitiesById,
      entityIds: entities.map((e) => e.id), forgeLoopActive: false,
    },
    forge: { tombstonesByChatId: {} },
  } as unknown as RootState;
}

function chat(over: Partial<Chat> = {}): Chat {
  return {
    id: "fc-1", type: "forge", title: "Forge", subMode: "sketch",
    messages: [], seed: { kind: "blank" }, ...over,
  };
}

const assistantMsg: ChatMessage = { id: "m-1", role: "assistant", content: "" };
const userMsg: ChatMessage = { id: "m-u", role: "user", content: "hi" };

describe("forgeSpec.inlineEntityIdsFor", () => {
  it("returns drafts owned by the given assistant message", () => {
    const drafts = [
      entity({ id: "d1", sourceChatId: "fc-1", lastAffectingMessageId: "m-1" }),
      entity({ id: "d2", sourceChatId: "fc-1", lastAffectingMessageId: "m-1" }),
      entity({ id: "d3", sourceChatId: "fc-1", lastAffectingMessageId: "m-2" }),
    ];
    const ctx: SpecCtx = {
      getState: () => stateWith(drafts),
      dispatch: vi.fn(),
    };
    const ids = forgeSpec.inlineEntityIdsFor!(assistantMsg, chat(), ctx);
    expect(ids.sort()).toEqual(["d1", "d2"]);
  });

  it("returns [] for user messages", () => {
    const ctx: SpecCtx = {
      getState: () => stateWith([
        entity({ id: "d1", sourceChatId: "fc-1", lastAffectingMessageId: "m-1" }),
      ]),
      dispatch: vi.fn(),
    };
    expect(forgeSpec.inlineEntityIdsFor!(userMsg, chat(), ctx)).toEqual([]);
  });

  it("excludes live entities", () => {
    const ctx: SpecCtx = {
      getState: () => stateWith([
        entity({ id: "d1", sourceChatId: "fc-1", lastAffectingMessageId: "m-1", lifecycle: "live" }),
      ]),
      dispatch: vi.fn(),
    };
    expect(forgeSpec.inlineEntityIdsFor!(assistantMsg, chat(), ctx)).toEqual([]);
  });

  it("excludes entities from other chats", () => {
    const ctx: SpecCtx = {
      getState: () => stateWith([
        entity({ id: "d1", sourceChatId: "fc-OTHER", lastAffectingMessageId: "m-1" }),
      ]),
      dispatch: vi.fn(),
    };
    expect(forgeSpec.inlineEntityIdsFor!(assistantMsg, chat(), ctx)).toEqual([]);
  });
});
