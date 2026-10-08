import { describe, it, expect, vi } from "vitest";
import { registerForgeChatEffects } from "../../../../src/core/store/effects/forge-chat-effects";
import {
  forgeChatContinueRequested,
  entityDiscardRequested,
  entityCastRequested,
  forgeCastAllRequested,
  forgeDiscardAllRequested,
  scenarioPlanRequested,
} from "../../../../src/core/store/effects/forge-chat-effects";
import { chatHandler } from "../../../../src/core/store/effects/handlers/chat";
import type {
  ChatTarget,
  CompletionContext,
} from "../../../../src/core/store/effects/generation-handlers";
import { createStore, combineReducers } from "nai-store";
import { chatSlice } from "../../../../src/core/store/slices/chat";
import { worldSlice } from "../../../../src/core/store/slices/world";
import type { RootState, WorldEntity } from "../../../../src/core/store/types";
import type { Chat } from "../../../../src/core/chat-types/types";
import { FieldID } from "../../../../src/config/field-definitions";
import { SCENARIO_BUILD_INSTRUCTION } from "../../../../src/core/utils/prompts";

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
    id: "e",
    categoryId: FieldID.DramatisPersonae,
    name: "X",
    summary: "",
    lifecycle: "draft",
    ...over,
  } as WorldEntity;
}

function makeChat(over: Partial<Chat> = {}): Chat {
  return {
    id: "fc-1",
    type: "scenario",
    title: "Scenario 1",
    messages: [],
    seed: { kind: "blank" },
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
    world: { threads: [], entitiesById, entityIds: entities.map((e) => e.id) },
    runtime: { queue: [], activeRequest: null },
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
  registerForgeChatEffects(subscribeEffect as any, dispatch, getState);

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
  it("is a no-op while a forge request is already pending (no stacked turn)", async () => {
    const chat = makeChat();
    const state = makeState([chat], []);
    (state.runtime as { queue: unknown[] }).queue = [
      { id: "r1", type: "forgeChat" },
    ];
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("adds one empty assistant turn and queues one forgeChat request whose id starts with scenario-", async () => {
    const state = makeState([makeChat()], []);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));

    const placeholders = dispatch.mock.calls.filter(
      ([a]) =>
        a.type === "chat/messageAdded" &&
        (a.payload as any).message?.role === "assistant" &&
        (a.payload as any).message?.content === "",
    );
    expect(placeholders).toHaveLength(1);
    const queued = dispatch.mock.calls.filter(
      ([a]) => a.type === "runtime/requestQueued",
    );
    expect(queued).toHaveLength(1);
    expect(queued[0][0].payload.type).toBe("forgeChat");
    expect(queued[0][0].payload.id).toMatch(/^scenario-fc-1-/);
    const submitted = dispatch.mock.calls.filter(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(submitted).toHaveLength(1);
    expect(
      (submitted[0][0].payload as { requestId: string }).requestId,
    ).toMatch(/^scenario-/);
  });

  it("ignores when chat does not exist", async () => {
    const state = makeState([]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested({ chatId: "missing" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("entityDiscardRequested effect", () => {
  it("dispatches entityDeleted", async () => {
    const chat = makeChat();
    const draft = makeEntity({
      id: "d1",
      name: "Vesper",
      sourceChatId: "fc-1",
      lifecycle: "draft",
      categoryId: FieldID.DramatisPersonae,
    });
    const state = makeState([chat], [draft]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d1" }));
    const del = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityDeleted",
    );
    expect(del).toBeDefined();
  });

  it("ignores discard on a live entity (only drafts are discardable via this path)", async () => {
    const live = makeEntity({
      id: "live-1",
      lifecycle: "live",
      lorebookEntryId: "lb-1",
    });
    const state = makeState([makeChat()], [live]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "live-1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("deletes a source-less (manual) draft", async () => {
    const orphan = makeEntity({ id: "d-orphan", lifecycle: "draft" });
    const state = makeState([makeChat()], [orphan]);
    const { dispatch, fire } = makeHarness(state);
    await fire(entityDiscardRequested({ entityId: "d-orphan" }));
    const deleted = dispatch.mock.calls.find(
      ([a]) => a.type === "world/entityDeleted",
    );
    expect(deleted).toBeDefined();
    expect((deleted![0].payload as { entityId: string }).entityId).toBe(
      "d-orphan",
    );
  });
});

describe("whether a Build turn was directed", () => {
  // The tail is the writer's own Plan message: a failed Plan turn left it
  // there, and an empty Build send must still stand on the fixed instruction.
  const chat = () =>
    makeChat({
      messages: [{ id: "u1", role: "user", content: "a lock-keeper" }],
    });
  const lastMessage = async (payload: {
    chatId: string;
    directed?: boolean;
  }) => {
    const state = makeState([chat()]);
    (state as { foundation: unknown }).foundation = { intensity: null };
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeChatContinueRequested(payload));
    const submitted = dispatch.mock.calls
      .map(([a]) => a)
      .find((a) => a.type === "ui/generationSubmitted");
    const { messages } = await submitted.payload.messageFactory();
    return messages[messages.length - 2] as Message;
  };

  it("carries an empty send to the strategy as not directed", async () => {
    expect(await lastMessage({ chatId: "fc-1", directed: false })).toEqual({
      role: "user",
      content: SCENARIO_BUILD_INSTRUCTION,
    });
  });

  it("carries a typed send to the strategy as directed", async () => {
    expect(await lastMessage({ chatId: "fc-1", directed: true })).toEqual({
      role: "user",
      content: "a lock-keeper",
    });
  });
});

describe("entityCastRequested effect", () => {
  it("noops for live entities", async () => {
    const live = makeEntity({
      id: "d1",
      sourceChatId: "fc-1",
      lifecycle: "live",
    });
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
  it("casts every draft of the chat and leaves the chat in place", async () => {
    const chat = makeChat();
    const d1 = makeEntity({
      id: "d1",
      sourceChatId: "fc-1",
      lifecycle: "draft",
    });
    const d2 = makeEntity({
      id: "d2",
      sourceChatId: "fc-1",
      lifecycle: "draft",
    });
    const live = makeEntity({
      id: "L",
      sourceChatId: "fc-1",
      lifecycle: "live",
    });
    const otherChat = makeEntity({
      id: "X",
      sourceChatId: "fc-OTHER",
      lifecycle: "draft",
    });
    const state = makeState([chat], [d1, d2, live, otherChat]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeCastAllRequested({ chatId: "fc-1" }));
    const castIds = dispatch.mock.calls
      .filter(([a]) => a.type === entityCastRequested.type)
      .map(([a]) => (a.payload as { entityId: string }).entityId)
      .sort();
    expect(castIds).toEqual(["d1", "d2"]);
    // Casting does not end the chat; it outlives any one batch of drafts.
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "chat/chatDeleted"),
    ).toBe(false);
  });
});

describe("forgeDiscardAllRequested effect", () => {
  it("deletes every draft and leaves the chat in place", async () => {
    const chat = makeChat();
    const d1 = makeEntity({
      id: "d1",
      name: "Vesper",
      sourceChatId: "fc-1",
      lifecycle: "draft",
    });
    const d2 = makeEntity({
      id: "d2",
      name: "Hollow",
      sourceChatId: "fc-1",
      lifecycle: "draft",
    });
    const state = makeState([chat], [d1, d2]);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeDiscardAllRequested({ chatId: "fc-1" }));

    const deletes = dispatch.mock.calls.filter(
      ([a]) => a.type === "world/entityDeleted",
    );
    expect(deletes).toHaveLength(2);
    // The chat stays: the chat is the story's, not the batch's.
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "chat/chatDeleted"),
    ).toBe(false);
  });

  it("leaves the chat in place when there are no drafts to discard", async () => {
    const chat = makeChat();
    const state = makeState([chat], []);
    const { dispatch, fire } = makeHarness(state);
    await fire(forgeDiscardAllRequested({ chatId: "fc-1" }));
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "chat/chatDeleted"),
    ).toBe(false);
  });
});

describe("chatDeleted effect", () => {
  it("does nothing when the chat is still there: the last chat is never deleted", async () => {
    const { dispatch, fire } = makeHarness(makeState([makeChat()], []));
    await fire({ type: "chat/chatDeleted", payload: { id: "fc-1" } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("releases the chat's drafts", async () => {
    // The state an effect reads is the one the reducer left: the chat is gone.
    const { dispatch, fire } = makeHarness(
      makeState([makeChat({ id: "other" })], []),
    );
    await fire({ type: "chat/chatDeleted", payload: { id: "fc-1" } });

    const dispatched = dispatch.mock.calls.map(([a]) => a);
    expect(dispatched).toContainEqual({
      type: "world/draftsReleasedFromChat",
      payload: { chatId: "fc-1" },
    });
  });
});

describe("a Build turn's placeholder", () => {
  it("is marked build and queued as a forgeChat request", async () => {
    const chat = makeChat({
      messages: [{ id: "u1", role: "user", content: "a lock-keeper" }],
    });
    const { dispatch, fire } = makeHarness(makeState([chat]));
    await fire(forgeChatContinueRequested({ chatId: "fc-1" }));

    const added = dispatch.mock.calls
      .map(([a]) => a)
      .filter((a) => a.type === "chat/messageAdded");
    expect(added[added.length - 1].payload.message).toMatchObject({
      role: "assistant",
      content: "",
      mode: "build",
    });
    const queued = dispatch.mock.calls
      .map(([a]) => a)
      .filter((a) => a.type === "runtime/requestQueued");
    expect(queued).toHaveLength(1);
    expect(queued[0].payload.type).toBe("forgeChat");
  });
});

describe("scenarioPlanRequested effect", () => {
  const withUser = () =>
    makeChat({
      messages: [{ id: "u1", role: "user", content: "a lock-keeper" }],
    });

  it("marks the placeholder plan and queues an ordinary chat request", async () => {
    const { dispatch, fire } = makeHarness(makeState([withUser()]));
    await fire(scenarioPlanRequested({ chatId: "fc-1" }));

    const calls = dispatch.mock.calls.map(([a]) => a);
    const added = calls.filter((a) => a.type === "chat/messageAdded");
    expect(added).toHaveLength(1);
    const placeholder = added[0].payload.message;
    expect(placeholder).toMatchObject({
      role: "assistant",
      content: "",
      mode: "plan",
    });
    const queued = calls.filter((a) => a.type === "runtime/requestQueued");
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({
      type: "chat",
      id: `chat-fc-1-${placeholder.id}`,
    });
    expect(
      calls.filter((a) => a.type === "ui/generationSubmitted"),
    ).toHaveLength(1);
  });

  it("is refused while a Build turn is pending", async () => {
    const state = makeState([withUser()]);
    (state.runtime as { queue: unknown[] }).queue = [
      { id: "scenario-fc-1-a0", type: "forgeChat", status: "queued" },
    ];
    const { dispatch, fire } = makeHarness(state);
    await fire(scenarioPlanRequested({ chatId: "fc-1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is refused while a Plan turn for this chat is pending", async () => {
    const state = makeState([withUser()]);
    (state.runtime as { activeRequest: unknown }).activeRequest = {
      id: "chat-fc-1-a0",
      type: "chat",
      status: "processing",
    };
    const { dispatch, fire } = makeHarness(state);
    await fire(scenarioPlanRequested({ chatId: "fc-1" }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is not refused by a cancelled request", async () => {
    const state = makeState([withUser()]);
    (state.runtime as { queue: unknown[] }).queue = [
      { id: "scenario-fc-1-a0", type: "forgeChat", status: "cancelled" },
    ];
    const { dispatch, fire } = makeHarness(state);
    await fire(scenarioPlanRequested({ chatId: "fc-1" }));
    expect(dispatch).toHaveBeenCalled();
  });

  const planPlaceholders = (calls: { type: string; payload?: any }[]) =>
    calls.filter(
      (a) =>
        a.type === "chat/messageAdded" && a.payload.message.mode === "plan",
    );

  /** A harness whose queue fills as requests are queued, as the store's does. */
  const queueing = () => {
    const state = makeState([withUser()]);
    const harness = makeHarness(state);
    harness.dispatch.mockImplementation(
      (a: { type: string; payload: object }) => {
        if (a.type !== "runtime/requestQueued") return;
        (state.runtime as { queue: unknown[] }).queue.push({
          ...a.payload,
          status: "queued",
        });
      },
    );
    return harness;
  };
  const queuedOf = (calls: { type: string; payload?: any }[], type: string) =>
    calls.filter(
      (a) => a.type === "runtime/requestQueued" && a.payload.type === type,
    );

  it("adds its placeholder and queues its request before it yields", () => {
    const { dispatch, fire } = makeHarness(makeState([withUser()]));
    void fire(scenarioPlanRequested({ chatId: "fc-1" }));
    // Not awaited: everything the effect does, it has done by now.
    const calls = dispatch.mock.calls.map(([a]) => a);
    expect(planPlaceholders(calls)).toHaveLength(1);
    expect(queuedOf(calls, "chat")).toHaveLength(1);
    expect(
      calls.filter((a) => a.type === "ui/generationSubmitted"),
    ).toHaveLength(1);
  });

  it("two Plan requests back to back add one placeholder and one request", async () => {
    const { dispatch, fire } = queueing();
    await Promise.all([
      fire(scenarioPlanRequested({ chatId: "fc-1" })),
      fire(scenarioPlanRequested({ chatId: "fc-1" })),
    ]);
    const calls = dispatch.mock.calls.map(([a]) => a);
    expect(planPlaceholders(calls)).toHaveLength(1);
    expect(queuedOf(calls, "chat")).toHaveLength(1);
  });

  it("a Build request right after a Plan request is refused", async () => {
    const { dispatch, fire } = queueing();
    await Promise.all([
      fire(scenarioPlanRequested({ chatId: "fc-1" })),
      fire(forgeChatContinueRequested({ chatId: "fc-1" })),
    ]);
    const calls = dispatch.mock.calls.map(([a]) => a);
    expect(
      calls.filter(
        (a) =>
          a.type === "chat/messageAdded" && a.payload.message.mode === "build",
      ),
    ).toHaveLength(0);
    expect(queuedOf(calls, "forgeChat")).toHaveLength(0);
  });

  it("a Plan reply with a command line applies nothing", async () => {
    const store = createStore(
      combineReducers({
        chat: chatSlice.reducer,
        world: worldSlice.reducer,
      }),
      false,
    );
    store.dispatch(
      chatSlice.actions.chatCreated({
        chat: makeChat({
          messages: [
            { id: "u1", role: "user", content: "a lock-keeper" },
            { id: "a1", role: "assistant", content: "", mode: "plan" },
          ],
        }),
      }),
    );
    const text =
      'Try this.\n[CREATE CHARACTER "Hesper Vane" | Keeps the lock.]';
    await chatHandler.completion({
      target: { type: "chat", chatId: "fc-1", messageId: "a1" },
      getState: store.getState,
      accumulatedText: text,
      generationSucceeded: true,
      dispatch: store.dispatch,
    } as unknown as CompletionContext<ChatTarget>);

    const chat = store.getState().chat.chats.find((c) => c.id === "fc-1")!;
    const reply = chat.messages.find((m) => m.id === "a1")!;
    expect(reply.content).toBe(text);
    expect(reply.forgeSegments).toBeUndefined();
    expect(store.getState().world.entityIds).toEqual([]);
  });
});
