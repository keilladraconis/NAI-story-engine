import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Store } from "nai-store";
import { makeTestStore } from "../helpers/store-helpers";
import { registerChatEffects } from "../../../../src/core/store/effects/chat-effects";
import { uiChatRefineRequested } from "../../../../src/core/store/slices/ui";
import { refineChatOpened } from "../../../../src/core/store/slices/chat";
import type { Chat } from "../../../../src/core/chat-types/types";
import type { Action } from "nai-store";
import type { RootState, AppDispatch } from "../../../../src/core/store/types";

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
      title: "Refining: existing",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "seed" },
      refineTarget: { fieldId: "intent", originalText: "seed" },
    };
    store.dispatch(refineChatOpened({ chat: minimalRefineChat }));
  };

  return {
    store,
    dispatchAndWait,
    getState,
    toast: vi.mocked(api.v1.ui.toast),
    openInitialRefine,
  };
}

describe("chat-effects: refine submit", () => {
  beforeEach(() => {
    // Reset the shared toast mock so prior-test calls don't contaminate
    // assertions. We do NOT replace globalThis.api — tests/setup.ts owns it.
    vi.mocked(api.v1.ui.toast).mockClear();
  });

  it("uiChatRefineRequested with empty source toasts and bails", async () => {
    const { dispatchAndWait, getState, toast } = makeHarness();
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "intent", sourceText: "  " }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringMatching(/empty/i),
      expect.any(Object),
    );
    expect(getState().chat.refineChat).toBeNull();
  });

  it("uiChatRefineRequested while refineChat already set toasts and bails", async () => {
    const { dispatchAndWait, getState, toast, openInitialRefine } = makeHarness();
    openInitialRefine();
    expect(getState().chat.refineChat).not.toBeNull();
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "attg", sourceText: "x" }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringMatching(/finish or discard/i),
      expect.any(Object),
    );
  });

  it("uiChatRefineRequested with valid input opens the refine slot", async () => {
    const { dispatchAndWait, getState } = makeHarness();
    await dispatchAndWait(
      uiChatRefineRequested({ fieldId: "intent", sourceText: "old text" }),
    );
    expect(getState().chat.refineChat?.refineTarget?.fieldId).toBe("intent");
    expect(getState().chat.refineChat?.refineTarget?.originalText).toBe(
      "old text",
    );
  });
});
