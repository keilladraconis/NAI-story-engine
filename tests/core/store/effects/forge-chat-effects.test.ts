import { describe, it, expect, vi } from "vitest";
import { registerForgeChatEffects } from "../../../../src/core/store/effects/forge-chat-effects";
import {
  forgeChatContinueRequested,
  entityDiscardRequested,
  forgeChatNewSessionRequested,
  entityCastRequested,
  forgeCastAllRequested,
  forgeDiscardAllRequested,
} from "../../../../src/core/store/effects/forge-chat-effects";
import type { RootState, WorldEntity } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";
import { FieldID } from "../../../../src/config/field-definitions";

// Isolate the effect from buildForgeBriefing's internals — it has its own tests.
vi.mock("../../../../src/core/utils/context-builder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../src/core/utils/context-builder")>()),
  buildForgeBriefing: vi.fn(async () => "BRIEFING TEXT"),
}));

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
    world: { groups: [], entitiesById, entityIds: entities.map(e=>e.id) },
    forge: { tombstonesByChatId: {}, pendingScrubByChatId: {} },
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

  it("queues a deferred scrub (no generation) when other drafts remain", async () => {
    const chat = makeChat();
    const target = makeEntity({ id: "d1", name: "Vesper", sourceChatId: "fc-1", lifecycle: "draft" });
    const sibling = makeEntity({ id: "d2", name: "Marsh", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [target, sibling]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    // Discard must NOT forge immediately — it flags a scrub for the next turn.
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeUndefined();
    const scrub = dispatch.mock.calls.find(([a]) => a.type === "forge/scrubQueued");
    expect(scrub).toBeDefined();
    expect((scrub![0].payload as any).names).toEqual(["Vesper"]);
  });

  it("does not queue a scrub when no other drafts remain", async () => {
    const chat = makeChat();
    const lone = makeEntity({ id: "d1", name: "Vesper", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [lone]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeUndefined();
    const scrub = dispatch.mock.calls.find(([a]) => a.type === "forge/scrubQueued");
    expect(scrub).toBeUndefined();
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

describe("forgeChatContinueRequested with a pending scrub", () => {
  it("leads off with a forgeCleanup turn before the phase turn", async () => {
    const chat = makeChat({ subMode: "sketch" });
    const draft = makeEntity({ id: "d1", name: "Marsh", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [draft]);
    // Seed a pending scrub for a discarded sibling.
    (state.forge as any).pendingScrubByChatId = { "fc-1": ["Vesper"] };
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));

    const submitted = dispatch.mock.calls
      .filter(([a]) => a.type === "ui/generationSubmitted")
      .map(([a]) => (a.payload as { target: { type: string } }).target.type);
    // Cleanup turn first, then the regular phase turn.
    expect(submitted).toEqual(["forgeCleanup", "forgeChat"]);
    const cleared = dispatch.mock.calls.find(([a]) => a.type === "forge/scrubCleared");
    expect(cleared).toBeDefined();
  });
});

describe("forgeChatContinueRequested with advancePhase: false", () => {
  it("keeps the current phase and submits a forgeChat turn", async () => {
    const chat = makeChat({ subMode: "expand" });
    const draft = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1", advancePhase: false }));
    const sub = dispatch.mock.calls.find(([a]) => a.type === "chat/subModeChanged");
    expect(sub).toBeDefined();
    expect(sub![0].payload.subMode).toBe("expand");
    const submitted = dispatch.mock.calls.find(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toBeDefined();
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

  it("seeds the briefing as the first (system) message of the new chat", async () => {
    const state = makeState([]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatNewSessionRequested({ initialUserMessage: "include Vesper" }));
    const created = dispatch.mock.calls.find(([a]) => a.type === "chat/chatCreated");
    expect(created).toBeDefined();
    const msgs = created![0].payload.chat.messages;
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe("BRIEFING TEXT");
    // The seeded user guidance follows the briefing.
    expect(
      msgs.some(
        (m: { role: string; content: string }) =>
          m.role === "user" && m.content === "include Vesper",
      ),
    ).toBe(true);
  });
});

describe("entityCastRequested effect", () => {
  it("noops for live entities", async () => {
    const live = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "live" });
    const state = makeState([makeChat()], [live]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityCastRequested({ entityId: "d1" }));
    expect(dispatch.mock.calls).toEqual([]);
  });

  it("noops for unknown entities", async () => {
    const state = makeState([makeChat()], []);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityCastRequested({ entityId: "nope" }));
    expect(dispatch.mock.calls).toEqual([]);
  });
});

describe("forgeCastAllRequested effect", () => {
  it("casts every draft owned by the chat, then closes the session", async () => {
    const chat = makeChat();
    const d1 = makeEntity({ id: "d1", sourceChatId: "fc-1", lifecycle: "draft" });
    const d2 = makeEntity({ id: "d2", sourceChatId: "fc-1", lifecycle: "draft" });
    const live = makeEntity({ id: "L", sourceChatId: "fc-1", lifecycle: "live" });
    const otherChat = makeEntity({ id: "X", sourceChatId: "fc-OTHER", lifecycle: "draft" });
    const state = makeState([chat], [d1, d2, live, otherChat]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeCastAllRequested({ chatId: "fc-1" }));
    const castIds = dispatch.mock.calls
      .filter(([a]) => a.type === entityCastRequested.type)
      .map(([a]) => (a.payload as { entityId: string }).entityId)
      .sort();
    expect(castIds).toEqual(["d1", "d2"]);
    // Cast All is the explicit session close.
    const closed = dispatch.mock.calls.find(([a]) => a.type === "chat/chatDeleted");
    expect(closed).toBeDefined();
    expect((closed![0].payload as { id: string }).id).toBe("fc-1");
  });
});

describe("forgeDiscardAllRequested effect", () => {
  it("tombstones and deletes every draft, then closes the session (no cleanup turn)", async () => {
    const chat = makeChat();
    const d1 = makeEntity({ id: "d1", name: "Vesper", sourceChatId: "fc-1", lifecycle: "draft" });
    const d2 = makeEntity({ id: "d2", name: "Hollow", sourceChatId: "fc-1", lifecycle: "draft" });
    const state = makeState([chat], [d1, d2]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeDiscardAllRequested({ chatId: "fc-1" }));

    const tombstones = dispatch.mock.calls.filter(
      ([a]) => a.type === "forge/tombstoneAdded",
    );
    expect(tombstones).toHaveLength(2);
    const deletes = dispatch.mock.calls.filter(
      ([a]) => a.type === "world/entityDeleted",
    );
    expect(deletes).toHaveLength(2);
    // No cleanup turn — every draft is gone, nothing left to scrub.
    const cleanupTurns = dispatch.mock.calls.filter(
      ([a]) =>
        a.type === "ui/generationSubmitted" &&
        (a.payload as { target: { type: string } }).target.type === "forgeCleanup",
    );
    expect(cleanupTurns).toHaveLength(0);
    const closed = dispatch.mock.calls.find(([a]) => a.type === "chat/chatDeleted");
    expect(closed).toBeDefined();
  });

  it("closes the session even when there are no drafts to discard", async () => {
    const chat = makeChat();
    const state = makeState([chat], []);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeDiscardAllRequested({ chatId: "fc-1" }));
    const cleanupTurns = dispatch.mock.calls.filter(
      ([a]) =>
        a.type === "ui/generationSubmitted" &&
        (a.payload as { target: { type: string } }).target.type === "forgeCleanup",
    );
    expect(cleanupTurns).toHaveLength(0);
    const closed = dispatch.mock.calls.find(([a]) => a.type === "chat/chatDeleted");
    expect(closed).toBeDefined();
  });
});
