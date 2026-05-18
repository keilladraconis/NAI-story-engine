import { describe, it, expect, vi } from "vitest";
import { registerForgeChatEffects } from "../../../../src/core/store/effects/forge-chat-effects";
import {
  forgeChatContinueRequested,
  entityDiscardRequested,
  forgeChatNewSessionRequested,
} from "../../../../src/core/store/effects/forge-chat-effects";
import type { RootState, WorldEntity } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";
import { FieldID } from "../../../../src/config/field-definitions";

type EffectHandler = (
  action: { type: string; payload: unknown },
  ctx: { getState: () => RootState },
) => Promise<void> | void;

interface Subscription {
  predicate: (action: { type: string }) => boolean;
  handler: EffectHandler;
}

function makeEntity(over: Partial<WorldEntity>): WorldEntity {
  return {
    id: "e", categoryId: FieldID.DramatisPersonae,
    name: "X", summary: "", lifecycle: "draft", ...over,
  } as WorldEntity;
}

function makeChat(over: Partial<Chat> = {}): Chat {
  return {
    id: "fc-1", type: "forge", title: "Forge",
    subMode: "sketch", messages: [], seed: { kind: "blank" },
    ...over,
  };
}

function makeState(
  chats: Chat[] = [],
  entities: WorldEntity[] = [],
): RootState {
  const entitiesById: Record<string, WorldEntity> = {};
  for (const e of entities) entitiesById[e.id] = e;
  return {
    chat: { chats, activeChatId: chats[0]?.id ?? null, refineChat: null },
    world: { groups: [], entitiesById, entityIds: entities.map(e=>e.id), forgeLoopActive: false },
    forge: { tombstonesByChatId: {} },
  } as unknown as RootState;
}

function makeHarness(state: RootState) {
  const subs: Subscription[] = [];
  const dispatch = vi.fn();
  const subscribeEffect = vi.fn(
    (predicate: Subscription["predicate"], handler: EffectHandler) => {
      subs.push({ predicate, handler });
    },
  );
  let current = state;
  const getState = () => current;
  registerForgeChatEffects(
    subscribeEffect as any,
    dispatch,
    getState,
  );

  async function fire(action: { type: string; payload?: unknown }) {
    for (const s of subs) {
      if (s.predicate(action)) {
        await s.handler(action as any, { getState });
      }
    }
  }

  function setState(next: RootState) {
    current = next;
  }

  return { dispatch, fire, setState };
}

describe("forgeChatContinueRequested effect", () => {
  it("advances sketch → expand and submits a forgeChat generation", async () => {
    const chat = makeChat({ subMode: "sketch" });
    const draft = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));
    const sub = dispatch.mock.calls.find(([a]) => a.type === "chat/subModeChanged");
    expect(sub).toBeDefined();
    expect(sub![0].payload.subMode).toBe("expand");
    const placeholder = dispatch.mock.calls.find(
      ([a]) => a.type === "chat/messageAdded" &&
              (a.payload as any).message?.role === "assistant",
    );
    expect(placeholder).toBeDefined();
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeDefined();
  });

  it("advances expand → weave", async () => {
    const chat = makeChat({ subMode: "expand" });
    const draft = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));
    const sub = dispatch.mock.calls.find(([a]) => a.type === "chat/subModeChanged");
    expect(sub![0].payload.subMode).toBe("weave");
  });

  it("advances weave → sketch (cycles)", async () => {
    const chat = makeChat({ subMode: "weave" });
    const draft = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));
    const sub = dispatch.mock.calls.find(([a]) => a.type === "chat/subModeChanged");
    expect(sub![0].payload.subMode).toBe("sketch");
  });

  it("forces sketch when the pool is empty even if current is expand", async () => {
    const chat = makeChat({ subMode: "expand" });
    const state = makeState([chat], []);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));
    const sub = dispatch.mock.calls.find(([a]) => a.type === "chat/subModeChanged");
    expect(sub![0].payload.subMode).toBe("sketch");
  });

  it("ignores when chat does not exist", async () => {
    const state = makeState([]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "missing" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("entityDiscardRequested effect", () => {
  it("dispatches tombstoneAdded with reason=user and entityDeleted", async () => {
    const chat = makeChat();
    const draft = makeEntity({
      id: "d1", name: "Vesper", sourceChatId: "fc-1",
      lifecycle: "draft", categoryId: FieldID.DramatisPersonae,
    });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    const tomb = dispatch.mock.calls.find(([a]) => a.type === "forge/tombstoneAdded");
    expect(tomb).toBeDefined();
    expect(tomb![0].payload.tombstone.reason).toBe("user");
    expect(tomb![0].payload.tombstone.name).toBe("Vesper");
    const del = dispatch.mock.calls.find(([a]) => a.type === "world/entityDeleted");
    expect(del).toBeDefined();
  });

  it("submits a cleanup turn when other drafts remain in the pool", async () => {
    const chat = makeChat();
    const target = makeEntity({ id: "d1", name: "Vesper", sourceChatId: "fc-1", lifecycle: "draft" });
    const sibling = makeEntity({ id: "d2", name: "Marsh", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [target, sibling]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeDefined();
    expect((submitted![0].payload as any).target?.type).toBe("forgeCleanup");
  });

  it("skips cleanup when pool would be empty after discard", async () => {
    const chat = makeChat();
    const lone = makeEntity({ id: "d1", name: "Vesper", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [lone]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeUndefined();
  });

  it("ignores discard on a live entity (only drafts are discardable via this path)", async () => {
    const live = makeEntity({ id: "live-1", lifecycle: "live", lorebookEntryId: "lb-1" });
    const state = makeState([makeChat()], [live]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "live-1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores discard when entity has no sourceChatId", async () => {
    const orphan = makeEntity({ id: "d-orphan", lifecycle: "draft" });
    const state = makeState([makeChat()], [orphan]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d-orphan" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("forgeChatNewSessionRequested effect", () => {
  it("creates a new forge-type chat and submits the first sketch turn", async () => {
    const state = makeState([]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatNewSessionRequested({ initialUserMessage: "include Vesper" }));
    const created = dispatch.mock.calls.find(([a]) => a.type === "chat/chatCreated");
    expect(created).toBeDefined();
    expect(created![0].payload.chat.type).toBe("forge");
    expect(created![0].payload.chat.subMode).toBe("sketch");
    expect(
      created![0].payload.chat.messages.some(
        (m: { role: string; content: string }) =>
          m.role === "user" && m.content === "include Vesper",
      ),
    ).toBe(true);
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeDefined();
  });

  it("creates a new forge chat with no initial user message when none provided", async () => {
    const state = makeState([]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatNewSessionRequested({}));
    const created = dispatch.mock.calls.find(([a]) => a.type === "chat/chatCreated");
    expect(created).toBeDefined();
    const userMsgs = created![0].payload.chat.messages.filter(
      (m: { role: string }) => m.role === "user",
    );
    expect(userMsgs).toEqual([]);
  });
});
