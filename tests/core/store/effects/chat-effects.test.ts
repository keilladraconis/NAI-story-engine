import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Store } from "nai-store";
import { makeTestStore } from "../helpers/store-helpers";
import {
  registerChatEffects,
  sameSummarySource,
  chatHasPendingRequest,
} from "../../../../src/core/store/effects/chat-effects";
import {
  uiChatRefineRequested,
  uiChatSubmitUserMessage,
  uiChatSummarizeRequested,
  uiChatRetryGeneration,
} from "../../../../src/core/store/slices/ui";
import {
  chatCreated,
  chatSwitched,
} from "../../../../src/core/store/slices/chat";
import { forgeChatContinueRequested } from "../../../../src/core/store/effects/forge-chat-actions";
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
      type: "brainstorm",
      title: "Brainstorm",
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
      type: "brainstorm",
      title: "Brainstorm",
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
    type: "brainstorm",
    title: "Brainstorm",
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
        seed: { kind: "fromChat", sourceChatId: "bs-src" },
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
        seed: { kind: "fromChat", sourceChatId: "bs-src" },
      }),
    );
    const first = summaries(store)[0];
    // The first summary's request is queued, i.e. still generating.
    expect(chatHasPendingRequest(getState().runtime, first.id)).toBe(true);

    store.dispatch(chatSwitched({ id: "bs-src" }));
    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromChat", sourceChatId: "bs-src" },
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
        seed: { kind: "fromChat", sourceChatId: "bs-src" },
      }),
    );
    await dispatchAndWait(
      uiChatSummarizeRequested({
        seed: { kind: "fromChat", sourceChatId: "bs-other" },
      }),
    );

    expect(summaries(store)).toHaveLength(2);
  });
});

describe("sameSummarySource", () => {
  it("matches a repeat of the same source", () => {
    expect(
      sameSummarySource(
        { kind: "fromChat", sourceChatId: "a" },
        { kind: "fromChat", sourceChatId: "a" },
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
        { kind: "fromChat", sourceChatId: "a" },
        { kind: "fromChat", sourceChatId: "b" },
      ),
    ).toBe(false);
    expect(
      sameSummarySource(
        { kind: "fromChat", sourceChatId: "a" },
        { kind: "fromStoryText", sourceText: "a" },
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

describe("retrying a forge turn", () => {
  // Reported against 0.14.2: a Forge pass answered conversationally, the writer
  // retried the turn, the retry came back in perfect command format — and
  // produced no entity cards and a Commit button that stayed disabled.
  //
  // The generic retry builds its strategy with `buildChatStrategy`, which knows
  // the refine path and the saved-chat path and nothing about the Forge. A
  // forge turn therefore retried as an ORDINARY CHAT: target `{type: "chat"}`,
  // routed to `chatHandler`, which writes the message text and stops. Nothing
  // parsed the commands, nothing dispatched `entityForged`, so no draft existed
  // to render as an inline card or for Commit to count — while the text on
  // screen looked exactly right.
  //
  // `forgeChatContinueRequested({advancePhase: false})` is the path that was
  // always meant to serve this; forge-chat-effects documents that case as
  // "empty-send / retry", and not advancing re-runs the CURRENT phase, which is
  // what a retry means.
  function forgeChat(): Chat {
    return {
      id: "fc-1",
      type: "forge",
      title: "Forge",
      subMode: "sketch",
      messages: [
        { id: "u1", role: "user", content: "build it" },
        { id: "a1", role: "assistant", content: "sure, let's chat about it" },
      ],
      seed: { kind: "blank" },
    } as Chat;
  }

  it("re-runs the forge pass rather than an ordinary chat turn", async () => {
    const h = makeHarness();
    h.store.dispatch(chatCreated({ chat: forgeChat() }));
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

    expect(seen).toContain(forgeChatContinueRequested.type);
    expect(seen).not.toContain("ui/generationSubmitted");
  });

  it("does not re-run the forge pass for an ordinary chat", async () => {
    // The branch must be on chat type, not on "is there a forge chat anywhere".
    const h = makeHarness();
    h.store.dispatch(
      chatCreated({
        chat: {
          id: "bs-1",
          type: "brainstorm",
          title: "Brainstorm",
          subMode: "cowriter",
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
    expect(seen).toContain("ui/generationSubmitted");
  });
});
