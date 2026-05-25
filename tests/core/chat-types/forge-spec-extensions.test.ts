import { describe, it, expect, vi } from "vitest";
import { forgeSpec } from "../../../src/core/chat-types/forge";
import type { Chat, ChatMessage, SpecCtx } from "../../../src/core/chat-types/types";
import { forgeChatContinueRequested } from "../../../src/core/store/effects/forge-chat-effects";
import { messageAdded } from "../../../src/core/store/slices/chat";
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

describe("forgeSpec.handleSend", () => {
  it("empty content dispatches forgeChatContinueRequested with no advancePhase override", () => {
    const dispatch = vi.fn();
    const ctx: SpecCtx = {
      getState: () => stateWith([]),
      dispatch: dispatch as any,
    };
    const handled = forgeSpec.handleSend!(chat(), "   ", ctx);
    expect(handled).toBe(true);
    const call = dispatch.mock.calls.find(
      ([a]) => a.type === forgeChatContinueRequested.type,
    );
    expect(call).toBeDefined();
    expect(call![0].payload).toEqual({ chatId: "fc-1" });
  });

  it("non-empty content appends user message and dispatches advancePhase:false", () => {
    const dispatch = vi.fn();
    const ctx: SpecCtx = {
      getState: () => stateWith([]),
      dispatch: dispatch as any,
    };
    const handled = forgeSpec.handleSend!(chat(), "more about Vesper", ctx);
    expect(handled).toBe(true);
    const userCall = dispatch.mock.calls.find(
      ([a]) => a.type === messageAdded.type,
    );
    expect(userCall).toBeDefined();
    expect(userCall![0].payload.message.role).toBe("user");
    expect(userCall![0].payload.message.content).toBe("more about Vesper");
    const continueCall = dispatch.mock.calls.find(
      ([a]) => a.type === forgeChatContinueRequested.type,
    );
    expect(continueCall).toBeDefined();
    expect(continueCall![0].payload).toEqual({ chatId: "fc-1", advancePhase: false });
  });
});
