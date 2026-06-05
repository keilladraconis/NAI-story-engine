import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Store } from "nai-store";
import { makeTestStore } from "../helpers/store-helpers";
import { registerChatEffects } from "../../../../src/core/store/effects/chat-effects";
import {
  uiChatRefineRequested,
  uiChatSubmitUserMessage,
} from "../../../../src/core/store/slices/ui";
import { chatCreated } from "../../../../src/core/store/slices/chat";
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
  beforeEach(() => {
    vi.mocked(api.v1.storyStorage.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
  });

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
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue("a fresh idea");

    await dispatchAndWait(uiChatSubmitUserMessage({ chatId: "bs1" }));

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
});
