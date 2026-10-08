import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Store } from "nai-store";
import { createStore, combineReducers } from "nai-store";
import {
  registerForgeChatEffects,
  scenarioTurnUndoRequested,
} from "../../../../src/core/store/effects/forge-chat-effects";
import { makeTestStore } from "../helpers/store-helpers";
import { chatSlice } from "../../../../src/core/store/slices/chat";
import { uiSlice } from "../../../../src/core/store/slices/ui";
import {
  runtimeSlice,
  requestQueued,
} from "../../../../src/core/store/slices/runtime";
import {
  worldSlice,
  entityForged,
} from "../../../../src/core/store/slices/world";
import { FieldID } from "../../../../src/config/field-definitions";
import type { ChatMessage } from "../../../../src/core/chat-types/types";
import {
  registerChatEffects,
  sameSummarySource,
  chatHasPendingRequest,
} from "../../../../src/core/store/effects/chat-effects";
import {
  uiChatRefineRequested,
  uiChatRetryGeneration,
  uiChatSubmitUserMessage,
  uiChatSummarizeRequested,
} from "../../../../src/core/store/slices/ui";
import {
  chatCreated,
  chatSwitched,
} from "../../../../src/core/store/slices/chat";
import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
} from "../../../../src/core/store/effects/forge-chat-actions";
import type { Chat } from "../../../../src/core/chat-types/types";
import type { Action } from "nai-store";
import type { RootState, AppDispatch } from "../../../../src/core/store/types";

// Isolate the submit handler's branching logic from strategy construction:
// buildChatStrategy's eager path reads story/world slices the minimal test
// store does not carry, and its messageFactory is lazy anyway. A stub lets us
// assert what the effect dispatches (user message + assistant placeholder).
vi.mock("../../../../src/core/utils/chat-strategy", () => ({
  buildChatStrategy: vi.fn(async (_get, chat: Chat, assistantId: string) => ({
    requestId: `chat-${chat.id}-${assistantId}`,
    messageFactory: async () => ({ messages: [] }),
    target: { type: "chat", chatId: chat.id, messageId: assistantId },
  })),
}));

function makeHarness() {
  const store = makeTestStore();
  // chat-effects only reads chat/ui/runtime; the test root is a structural
  // subset of RootState, so we cast subscribeEffect/getState to RootState
  // shape at the registration boundary.
  registerChatEffects(
    store.subscribeEffect as Store<RootState>["subscribeEffect"],
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
  );
  // A Scenario retry is handed to these effects (one guard for all Scenario
  // work), so the retry tests need them registered.
  registerForgeChatEffects(
    store.subscribeEffect as Store<RootState>["subscribeEffect"],
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
  );

  const dispatchAndWait = async (action: Action) => {
    store.dispatch(action);
    // Allow async effect handlers to settle. A handful of microtask flushes
    // covers the no-await refine path comfortably.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  const getState = () => store.getState();

  const openInitialRefine = () => {
    const minimalRefineChat: Chat = {
      id: "refine-initial",
      type: "refine",
      title: "Refining: intent",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "seed" },
      refineTarget: { fieldId: "intent", originalText: "seed" },
    };
    store.dispatch(chatCreated({ chat: minimalRefineChat }));
  };

  const refineChats = () =>
    store.getState().chat.chats.filter((c) => c.type === "refine");

  return {
    store,
    dispatchAndWait,
    getState,
    toast: vi.mocked(api.v1.ui.toast),
    openInitialRefine,
    refineChats,
  };
}

describe("chat-effects: refine submit", () => {
  beforeEach(() => {
    // Reset the shared toast mock so prior-test calls don't contaminate
    // assertions. We do NOT replace globalThis.api — tests/setup.ts owns it.
    vi.mocked(api.v1.ui.toast).mockClear();
  });

  it("uiChatRefineRequested with empty source toasts and bails", async () => {
    const { dispatchAndWait, toast, refineChats } = makeHarness();
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "intent", sourceText: "  " }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringMatching(/empty/i),
      expect.any(Object),
    );
    expect(refineChats()).toHaveLength(0);
  });

  it("uiChatRefineRequested reuses the open refine for the same field", async () => {
    const { dispatchAndWait, getState, openInitialRefine, refineChats } =
      makeHarness();
    openInitialRefine();
    expect(refineChats()).toHaveLength(1);
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "intent", sourceText: "x" }),
    );
    // No duplicate — the existing refine is reused and re-foregrounded.
    expect(refineChats()).toHaveLength(1);
    expect(getState().chat.activeChatId).toBe("refine-initial");
  });

  it("uiChatRefineRequested with valid input creates a refine chat", async () => {
    const { dispatchAndWait, getState, refineChats } = makeHarness();
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "intent", sourceText: "old text" }),
    );
    const refine = refineChats()[0];
    expect(refine?.refineTarget?.fieldId).toBe("intent");
    expect(refine?.refineTarget?.originalText).toBe("old text");
    // The new refine chat is foregrounded.
    expect(getState().chat.activeChatId).toBe(refine?.id);
  });
});

describe("chat-effects: user-message submit generates on first send", () => {
  it("adds an assistant placeholder after a non-empty submit (no second send required)", async () => {
    const { store, dispatchAndWait } = makeHarness();
    const chat: Chat = {
      id: "bs1",
      type: "summary",
      title: "Summary",
      messages: [],
      seed: { kind: "blank" },
    };
    store.dispatch(chatCreated({ chat }));

    await dispatchAndWait(
      uiChatSubmitUserMessage({ chatId: "bs1", text: "a fresh idea" }),
    );

    const msgs = store
      .getState()
      .chat.chats.find((c) => c.id === "bs1")!.messages;
    // The user's message is recorded.
    expect(
      msgs.some((m) => m.role === "user" && m.content === "a fresh idea"),
    ).toBe(true);
    // Regression guard: the assistant placeholder must be created on the FIRST
    // send. The botched v13←main merge dropped the post-dispatch chat re-read,
    // so `last` was computed from a stale snapshot and generation never fired
    // until a second (empty) send.
    expect(msgs.some((m) => m.role === "assistant")).toBe(true);
  });

  it("a concurrent empty submit cannot blank a message already in flight", async () => {
    // A mobile tap delivers `click` twice: the real send, then an empty one
    // fired after the composer cleared. While the text travelled through a
    // shared storyStorage slot, the empty send overwrote the slot before the
    // first effect's async read — so nothing was ever posted. Carrying the text
    // in the payload makes the two sends independent.
    const { store, dispatchAndWait } = makeHarness();
    const chat: Chat = {
      id: "bs2",
      type: "summary",
      title: "Summary",
      messages: [],
      seed: { kind: "blank" },
    };
    store.dispatch(chatCreated({ chat }));

    await Promise.all([
      dispatchAndWait(
        uiChatSubmitUserMessage({ chatId: "bs2", text: "hello" }),
      ),
      dispatchAndWait(uiChatSubmitUserMessage({ chatId: "bs2", text: "" })),
    ]);

    const msgs = store
      .getState()
      .chat.chats.find((c) => c.id === "bs2")!.messages;
    expect(msgs.some((m) => m.role === "user" && m.content === "hello")).toBe(
      true,
    );
  });
});

describe("chat-effects: summarize is one summary per tap", () => {
  const sourceChat: Chat = {
    id: "bs-src",
    type: "scenario",
    title: "Scenario 1",
    messages: [
      { id: "m1", role: "user", content: "an idea" },
      { id: "m2", role: "assistant", content: "a reply" },
    ],
    seed: { kind: "blank" },
  };

  const summaries = (store: ReturnType<typeof makeTestStore>) =>
    store.getState().chat.chats.filter((c) => c.type === "summary");

  it("a doubled Sum tap opens one summary chat, not two", async () => {
    // Every summarize mints a fresh chat id and assistant id, so the two
    // requests of a doubled tap carry different request ids and nothing
    // downstream can see them as one. The second used to open its own summary
    // chat and run a second generation over the same transcript.
    const { store, dispatchAndWait } = makeHarness();
    store.dispatch(chatCreated({ chat: sourceChat }));

    const sum = () =>
      uiChatSummarizeRequested({
        seed: { kind: "fromStoryText", sourceText: "story A" },
      });
    // Both taps land before the first has finished building its strategy.
    store.dispatch(sum());
    await dispatchAndWait(sum());

    expect(summaries(store)).toHaveLength(1);
  });

  it("a second press while the summary is still generating reopens that one", async () => {
    const { store, dispatchAndWait, getState } = makeHarness();
    store.dispatch(chatCreated({ chat: sourceChat }));

    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromStoryText", sourceText: "story A" },
      }),
    );
    const first = summaries(store)[0];
    // The first summary's request is queued, i.e. still generating.
    expect(chatHasPendingRequest(getState().runtime, first.id)).toBe(true);

    store.dispatch(chatSwitched({ id: "bs-src" }));
    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromStoryText", sourceText: "story A" },
      }),
    );

    expect(summaries(store)).toHaveLength(1);
    // …and it is brought back to the front rather than silently ignored.
    expect(getState().chat.activeChatId).toBe(first.id);
  });

  it("summarizing a different source still opens its own summary", async () => {
    const { store, dispatchAndWait } = makeHarness();
    store.dispatch(chatCreated({ chat: sourceChat }));
    store.dispatch(chatCreated({ chat: { ...sourceChat, id: "bs-other" } }));

    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromStoryText", sourceText: "story A" },
      }),
    );
    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromStoryText", sourceText: "story B" },
      }),
    );

    expect(summaries(store)).toHaveLength(2);
  });
});

describe("sameSummarySource", () => {
  it("matches a repeat of the same source", () => {
    expect(
      sameSummarySource(
        { kind: "fromStoryText", sourceText: "a" },
        { kind: "fromStoryText", sourceText: "a" },
      ),
    ).toBe(true);
    expect(
      sameSummarySource(
        { kind: "fromStoryText", sourceText: "once upon a time" },
        { kind: "fromStoryText", sourceText: "once upon a time" },
      ),
    ).toBe(true);
  });

  it("does not match a different source, or a different kind", () => {
    expect(
      sameSummarySource(
        { kind: "fromStoryText", sourceText: "a" },
        { kind: "fromStoryText", sourceText: "b" },
      ),
    ).toBe(false);
    expect(
      sameSummarySource(
        { kind: "fromStoryText", sourceText: "a" },
        { kind: "fromField", sourceFieldId: "attg", sourceText: "a" },
      ),
    ).toBe(false);
  });

  it("never matches seeds that are not summary sources", () => {
    // Two blank seeds carry no identity — treating them as the same source
    // would block unrelated work.
    expect(sameSummarySource({ kind: "blank" }, { kind: "blank" })).toBe(false);
  });
});

describe("chatHasPendingRequest", () => {
  const runtime = (queue: { id: string; status?: string }[], active?: string) =>
    ({
      queue: queue.map((r) => ({
        id: r.id,
        type: "chat",
        targetId: "t",
        status: r.status ?? "queued",
      })),
      activeRequest: active
        ? { id: active, type: "chat", targetId: "t", status: "processing" }
        : null,
    }) as unknown as RootState["runtime"];

  it("sees a queued request, an active one, and a continuation", () => {
    expect(chatHasPendingRequest(runtime([{ id: "chat-c1-m1" }]), "c1")).toBe(
      true,
    );
    expect(chatHasPendingRequest(runtime([], "chat-c1-m1"), "c1")).toBe(true);
    expect(
      chatHasPendingRequest(runtime([{ id: "chat-c1-m1-cont-2" }]), "c1"),
    ).toBe(true);
  });

  it("ignores another chat's request, and a cancelled one", () => {
    expect(chatHasPendingRequest(runtime([{ id: "chat-c2-m1" }]), "c1")).toBe(
      false,
    );
    expect(
      chatHasPendingRequest(
        runtime([{ id: "chat-c1-m1", status: "cancelled" }]),
        "c1",
      ),
    ).toBe(false);
  });
});

describe("retrying a Scenario turn", () => {
  // Reported: the first pass answered conversationally, the writer retried the
  // turn, the retry came back in perfect command format — and produced no
  // entity cards and a dead Commit button.
  //
  // The generic retry builds its strategy with `buildChatStrategy`, which knows
  // refine and the saved-chat path and nothing about the Forge. A Scenario turn
  // therefore retried as an ORDINARY CHAT: target `{type: "chat"}`, routed to
  // `chatHandler`, which writes the message text and stops. Nothing parses the
  // commands, nothing dispatches `entityForged`, no draft exists to render as a
  // card or for Commit to count — while the text on screen looks perfect.
  //
  // `forgeChatContinueRequested` is the path that serves this: it queues a real
  // Scenario turn, and the strategy re-reads which kind of turn it is.
  function forgeChat(): Chat {
    return {
      id: "fc-1",
      type: "scenario",
      title: "Scenario 1",
      messages: [
        { id: "u1", role: "user", content: "build it" },
        { id: "a1", role: "assistant", content: "sure, let's chat about it" },
      ],
      seed: { kind: "blank" },
    };
  }

  it("re-runs the Scenario turn rather than an ordinary chat turn", async () => {
    const h = makeHarness();
    h.store.dispatch(chatCreated({ chat: forgeChat() }));
    h.store.dispatch(chatSwitched({ id: "fc-1" }));

    const seen: string[] = [];
    const targets: string[] = [];
    h.store.subscribeEffect(
      () => true,
      (action: Action) => {
        seen.push(action.type);
        if (action.type === "ui/generationSubmitted") {
          targets.push(
            (action as unknown as { payload: { target: { type: string } } })
              .payload.target.type,
          );
        }
      },
    );

    await h.dispatchAndWait(
      uiChatRetryGeneration({ chatId: "fc-1", messageId: "a1" }),
    );

    // The forge path, not the generic one. A generic submit carries a `chat`
    // target and no forge action; the forge path queues a `forgeChat` one.
    expect(seen).toContain(forgeChatContinueRequested.type);
    expect(targets).not.toContain("chat");
  });

  // The placeholder itself (and its `mode`) is made by the forge-chat effects,
  // which this harness does not register; the mode of the retried reply decides
  // which request the retry dispatches, and forge-chat-effects.test.ts covers
  // what each request writes.
  async function retryIn(
    toggle: string,
    replyMode: "plan" | "build" | undefined,
  ) {
    const h = makeHarness();
    const chat = forgeChat();
    chat.subMode = toggle;
    chat.messages[1] = { ...chat.messages[1], mode: replyMode };
    h.store.dispatch(chatCreated({ chat }));
    h.store.dispatch(chatSwitched({ id: "fc-1" }));
    const seen: string[] = [];
    h.store.subscribeEffect(
      () => true,
      (action: Action) => {
        seen.push(action.type);
      },
    );
    await h.dispatchAndWait(
      uiChatRetryGeneration({ chatId: "fc-1", messageId: "a1" }),
    );
    return seen;
  }

  it("re-runs a Plan reply as Plan with the toggle on Build", async () => {
    const seen = await retryIn("build", "plan");
    expect(seen).toContain(scenarioPlanRequested.type);
    expect(seen).not.toContain(forgeChatContinueRequested.type);
  });

  it("re-runs a Build reply as Build with the toggle on Plan", async () => {
    const seen = await retryIn("plan", "build");
    expect(seen).toContain(forgeChatContinueRequested.type);
    expect(seen).not.toContain(scenarioPlanRequested.type);
  });

  it("re-runs a reply from before the modes as Build", async () => {
    const seen = await retryIn("plan", undefined);
    expect(seen).toContain(forgeChatContinueRequested.type);
    expect(seen).not.toContain(scenarioPlanRequested.type);
  });

  it("does not re-run the Scenario turn for an ordinary chat", async () => {
    // The branch must be on chat type, not on "is there a Scenario chat anywhere".
    const h = makeHarness();
    h.store.dispatch(
      chatCreated({
        chat: {
          id: "bs-1",
          type: "summary",
          title: "Summary",
          messages: [
            { id: "u1", role: "user", content: "hi" },
            { id: "a1", role: "assistant", content: "hello" },
          ],
          seed: { kind: "blank" },
        } as Chat,
      }),
    );
    h.store.dispatch(chatSwitched({ id: "bs-1" }));

    const seen: string[] = [];
    h.store.subscribeEffect(
      () => true,
      (action: Action) => {
        seen.push(action.type);
      },
    );

    await h.dispatchAndWait(
      uiChatRetryGeneration({ chatId: "bs-1", messageId: "a1" }),
    );

    expect(seen).not.toContain(forgeChatContinueRequested.type);
    // …and the ordinary path still runs.
    expect(seen).toContain("ui/generationSubmitted");
  });
});

describe("retrying a Build reply undoes it first", () => {
  const revise = (id: string, before: string, wrote: string): ChatMessage => ({
    id,
    role: "assistant",
    content: "x",
    mode: "build",
    forgeSegments: [
      {
        kind: "action",
        action: {
          kind: "REVISE",
          status: "applied",
          name: "Kei",
          entityId: "k",
          undo: { op: "summary", entityId: "k", before, wrote },
        },
      },
    ],
  });
  const create = (id: string): ChatMessage => ({
    id,
    role: "assistant",
    content: "x",
    mode: "build",
    forgeSegments: [
      {
        kind: "action",
        action: {
          kind: "CREATE",
          status: "applied",
          name: "Kei",
          entityId: "k",
          undo: { op: "entityCreated", entityId: "k", entryCreated: true },
        },
      },
    ],
  });

  /** A real store with the chat and forge-chat effects registered. A
   *  recorder is subscribed first and captures what the World looked like
   *  when the new Build turn was asked for. */
  const arrange = (messages: ChatMessage[]) => {
    const store = createStore(
      combineReducers({
        chat: chatSlice.reducer,
        ui: uiSlice.reducer,
        runtime: runtimeSlice.reducer,
        world: worldSlice.reducer,
      }),
      false,
    );
    registerChatEffects(
      store.subscribeEffect as never,
      store.dispatch as never,
      store.getState as never,
    );
    store.dispatch(
      entityForged({
        entity: {
          id: "k",
          categoryId: FieldID.DramatisPersonae,
          name: "Kei",
          summary: "New.",
          lifecycle: "live",
          lorebookEntryId: "e1",
        },
      }),
    );
    store.dispatch(
      chatCreated({
        chat: {
          id: "c1",
          type: "scenario",
          title: "Scenario 1",
          messages,
          seed: { kind: "blank" },
        },
      }),
    );
    const requests: { summary: string; ids: string[] }[] = [];
    store.subscribeEffect(
      (a: Action) => a.type === forgeChatContinueRequested.type,
      () => {
        requests.push({
          summary: store.getState().world.entitiesById.k.summary,
          ids: store
            .getState()
            .chat.chats.find((c) => c.id === "c1")!
            .messages.map((m) => m.id),
        });
      },
    );
    // After the recorder, so it sees the World and chat as the request arrives.
    registerForgeChatEffects(
      store.subscribeEffect as never,
      store.dispatch as never,
      store.getState as never,
    );
    const ids = () =>
      store
        .getState()
        .chat.chats.find((c) => c.id === "c1")!
        .messages.map((m) => m.id);
    const retry = async (messageId: string) => {
      store.dispatch(uiChatRetryGeneration({ chatId: "c1", messageId }));
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    return { store, requests, ids, retry };
  };

  beforeEach(() => {
    vi.mocked(api.v1.ui.toast).mockClear();
    vi.mocked(api.v1.lorebook.removeEntry).mockReset();
    vi.mocked(api.v1.lorebook.removeEntry).mockResolvedValue(undefined);
  });

  it("undoes a Build reply before re-running it", async () => {
    const { store, requests, ids, retry } = arrange([
      { id: "u1", role: "user", content: "go" },
      revise("b1", "Old.", "New."),
    ]);
    await retry("b1");
    expect(requests).toEqual([{ summary: "Old.", ids: ["u1"] }]);
    // b1 is gone; the new Build turn's placeholder follows u1.
    expect(ids()).toEqual(["u1", expect.any(String)]);
    expect(store.getState().world.entitiesById.k.summary).toBe("Old.");
  });

  it("refuses a retry that would drop a later Build reply still applied", async () => {
    const { store, requests, ids, retry } = arrange([
      { id: "u1", role: "user", content: "go" },
      revise("b1", "Old.", "Mid."),
      { id: "u2", role: "user", content: "more" },
      revise("b2", "Mid.", "New."),
    ]);
    await retry("b1");
    expect(ids()).toEqual(["u1", "b1", "u2", "b2"]);
    expect(requests).toHaveLength(0);
    expect(store.getState().world.entitiesById.k.summary).toBe("New.");
    expect(api.v1.ui.toast).toHaveBeenCalledWith(
      expect.stringContaining("Undo"),
      expect.anything(),
    );
  });

  it("refuses the retry when the undo could not finish", async () => {
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: "e1",
      displayName: "Kei",
    });
    vi.mocked(api.v1.lorebook.removeEntry).mockRejectedValue(new Error("no"));
    const { store, requests, ids, retry } = arrange([
      { id: "u1", role: "user", content: "go" },
      create("b1"),
    ]);
    await retry("b1");
    expect(ids()).toEqual(["u1", "b1"]);
    expect(requests).toHaveLength(0);
    expect(store.getState().world.entitiesById.k).toBeDefined();
  });

  it("does nothing while a forgeChat request is queued", async () => {
    const { store, requests, ids, retry } = arrange([
      { id: "u1", role: "user", content: "go" },
      revise("b1", "Old.", "New."),
    ]);
    store.dispatch(
      requestQueued({
        id: "scenario-c1-a0",
        type: "forgeChat",
        targetId: "a0",
      }),
    );
    await retry("b1");
    expect(ids()).toEqual(["u1", "b1"]);
    expect(requests).toHaveLength(0);
    expect(store.getState().world.entitiesById.k.summary).toBe("New.");
  });
});

describe("one guard for all Scenario work on a chat", () => {
  const applied = (id: string): ChatMessage => ({
    id,
    role: "assistant",
    content: "x",
    mode: "build",
    forgeSegments: [
      {
        kind: "action",
        action: {
          kind: "CREATE",
          status: "applied",
          name: "Kei",
          entityId: "k",
          undo: { op: "entityCreated", entityId: "k", entryCreated: true },
        },
      },
    ],
  });
  const arrange = () => {
    const store = createStore(
      combineReducers({
        chat: chatSlice.reducer,
        ui: uiSlice.reducer,
        runtime: runtimeSlice.reducer,
        world: worldSlice.reducer,
      }),
      false,
    );
    registerForgeChatEffects(
      store.subscribeEffect as never,
      store.dispatch as never,
      store.getState as never,
    );
    store.dispatch(
      entityForged({
        entity: {
          id: "k",
          categoryId: FieldID.DramatisPersonae,
          name: "Kei",
          summary: "S.",
          lifecycle: "live",
          lorebookEntryId: "e1",
        },
      }),
    );
    store.dispatch(
      chatCreated({
        chat: {
          id: "c1",
          type: "scenario",
          title: "Scenario 1",
          seed: { kind: "blank" },
          messages: [{ id: "u1", role: "user", content: "go" }, applied("b1")],
        },
      }),
    );
    const flush = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    const messages = () =>
      store.getState().chat.chats.find((c) => c.id === "c1")!.messages;
    return { store, flush, messages };
  };
  const undo = () =>
    scenarioTurnUndoRequested({ chatId: "c1", messageId: "b1" });

  beforeEach(() => {
    vi.mocked(api.v1.lorebook.entry).mockReset();
    vi.mocked(api.v1.lorebook.entry).mockResolvedValue({
      id: "e1",
      displayName: "Kei",
    });
    vi.mocked(api.v1.lorebook.removeEntry).mockReset();
  });

  it("a second Undo request while the first is awaiting does not run it twice", async () => {
    let release!: () => void;
    vi.mocked(api.v1.lorebook.removeEntry).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const { store, flush, messages } = arrange();
    store.dispatch(undo());
    await flush();
    store.dispatch(undo());
    await flush();
    release();
    await flush();
    expect(api.v1.lorebook.removeEntry).toHaveBeenCalledTimes(1);
    expect(messages()[1].undone).toBe(true);
  });

  it("a Build send while an undo is awaiting queues nothing", async () => {
    let release!: () => void;
    vi.mocked(api.v1.lorebook.removeEntry).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const { store, flush, messages } = arrange();
    store.dispatch(undo());
    await flush();
    store.dispatch(forgeChatContinueRequested({ chatId: "c1" }));
    await flush();
    expect(store.getState().runtime.queue).toHaveLength(0);
    expect(store.getState().runtime.activeRequest).toBeNull();
    expect(messages()).toHaveLength(2);
    release();
    await flush();
  });

  it("Undo is refused while a Plan request is queued", async () => {
    const { store, flush, messages } = arrange();
    store.dispatch(
      requestQueued({ id: "chat-c1-p1", type: "chat", targetId: "p1" }),
    );
    store.dispatch(undo());
    await flush();
    expect(api.v1.lorebook.removeEntry).not.toHaveBeenCalled();
    expect(messages()[1].undone).toBeUndefined();
  });

  it("a second Undo of an already undone reply does nothing", async () => {
    vi.mocked(api.v1.lorebook.removeEntry).mockResolvedValue(undefined);
    const { store, flush } = arrange();
    store.dispatch(undo());
    await flush();
    store.dispatch(undo());
    await flush();
    expect(api.v1.lorebook.removeEntry).toHaveBeenCalledTimes(1);
  });
});
