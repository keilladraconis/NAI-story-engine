import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTestStore } from "../helpers/store-helpers";
import { registerChatEffects } from "../../../../src/core/store/effects/chat-effects";
import { uiChatRefineRequested } from "../../../../src/core/store/slices/ui";
import { refineChatOpened } from "../../../../src/core/store/slices/chat";
import type { Chat } from "../../../../src/core/chat-types/types";

function makeHarness() {
  const store = makeTestStore();
  // The test harness reducer combines only chat/ui/runtime, not the full root.
  registerChatEffects(
    store.subscribeEffect as any,
    store.dispatch,
    store.getState as any,
  );

  const dispatchAndWait = async (action: any) => {
    store.dispatch(action);
    // Allow async effect handlers to settle. A handful of microtask flushes
    // covers the no-await refine path comfortably.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  const getState = () => store.getState() as any;

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
    toast: api.v1.ui.toast as ReturnType<typeof vi.fn>,
    openInitialRefine,
  };
}

describe("chat-effects: refine submit", () => {
  beforeEach(() => {
    (globalThis as any).api = {
      v1: {
        uuid: () => "uuid-" + Math.random().toString(36).slice(2),
        ui: { toast: vi.fn(), updateParts: vi.fn() },
        config: { get: vi.fn().mockResolvedValue("glm-4-6") },
        storyStorage: { get: vi.fn(), set: vi.fn() },
      },
    };
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
