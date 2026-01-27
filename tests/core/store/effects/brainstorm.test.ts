import { describe, it, expect, vi, beforeEach } from "vitest";
import { store } from "../../../../src/core/store";
import {
  messageAdded,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  uiBrainstormRetryGeneration,
} from "../../../../src/core/store";
import { registerEffects } from "../../../../src/core/store/effects";
import { IDS } from "../../../../src/ui/framework/ids";
import { GenX } from "../../../../lib/gen-x";

describe("Brainstorm Effects", () => {
  let genXMock: GenX;

  beforeEach(() => {
    // Reset store state (simplified for this test)
    // In a real app we might need a fresh store, but here we can just clear messages
    store.dispatch({ type: "brainstorm/messagesCleared" });
    store.dispatch({ type: "ui/setBrainstormEditingMessageId", payload: null });

    // Clear mocks
    vi.clearAllMocks();

    genXMock = {
      generate: vi.fn(),
      cancelCurrent: vi.fn(),
      userInteraction: vi.fn(),
    } as any;
    registerEffects(store, genXMock);
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 10));

  it("should handle message editing flow correctly", async () => {
    // ... existing test ...
    // 1. Setup initial messages
    const msgA = { id: "msg-a", role: "user" as const, content: "Content A" };
    const msgB = {
      id: "msg-b",
      role: "assistant" as const,
      content: "Content B",
    };

    store.dispatch(messageAdded(msgA));
    store.dispatch(messageAdded(msgB));

    // 2. Begin editing Message A
    store.dispatch(uiBrainstormMessageEditBegin({ id: msgA.id }));
    await wait();

    // Verify storage seeded
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      `draft-${IDS.BRAINSTORM.message(msgA.id).INPUT}`,
      "Content A",
    );

    // Verify state updated
    expect(store.getState().ui.brainstorm.editingMessageId).toBe(msgA.id);

    // 3. Begin editing Message B (implicitly saves A)
    // Mock storage return for A's edited content
    (api.v1.storyStorage.get as any).mockResolvedValueOnce(
      "Content A Modified",
    );

    store.dispatch(uiBrainstormMessageEditBegin({ id: msgB.id }));
    await wait();

    // Verify A saved
    const updatedA = store
      .getState()
      .brainstorm.messages.find((m) => m.id === msgA.id);
    expect(updatedA?.content).toBe("Content A Modified");

    // Verify storage seeded for B
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      `draft-${IDS.BRAINSTORM.message(msgB.id).INPUT}`,
      "Content B",
    );

    // Verify state updated
    expect(store.getState().ui.brainstorm.editingMessageId).toBe(msgB.id);

    // 4. End editing (Save B)
    // Mock storage return for B's edited content
    (api.v1.storyStorage.get as any).mockResolvedValueOnce(
      "Content B Modified",
    );

    store.dispatch(uiBrainstormMessageEditEnd());
    await wait();

    // Verify B saved
    const updatedB = store
      .getState()
      .brainstorm.messages.find((m) => m.id === msgB.id);
    expect(updatedB?.content).toBe("Content B Modified");

    // Verify editing ID cleared
    expect(store.getState().ui.brainstorm.editingMessageId).toBe(null);
  });

  it("should handle retry generation correctly", async () => {
    // 1. Setup messages: User -> Assistant -> User (Retry Target) -> Assistant (Pruned)
    // Actually, if we retry the 2nd User message, we should keep it and regenerate the following Assistant message.
    // If we retry the last Assistant message, we prune it and regenerate it.

    const msg1 = { id: "msg-1", role: "user" as const, content: "User 1" };
    const msg2 = {
      id: "msg-2",
      role: "assistant" as const,
      content: "Assistant 1",
    };
    const msg3 = { id: "msg-3", role: "user" as const, content: "User 2" }; // Target
    const msg4 = {
      id: "msg-4",
      role: "assistant" as const,
      content: "Assistant 2",
    };

    store.dispatch(messageAdded(msg1));
    store.dispatch(messageAdded(msg2));
    store.dispatch(messageAdded(msg3));
    store.dispatch(messageAdded(msg4));

    // 2. Retry User 2 (msg3)
    store.dispatch(uiBrainstormRetryGeneration({ messageId: msg3.id }));
    await wait();

    // Verify history pruned (msg4 removed, msg3 kept)
    const messages = store.getState().brainstorm.messages;
    expect(messages.length).toBe(4); // User 1, Asst 1, User 2, NEW Asst
    expect(messages[2].id).toBe(msg3.id);
    expect(messages[3].id).not.toBe(msg4.id); // New ID
    expect(messages[3].role).toBe("assistant");
    expect(messages[3].content).toBe("");

    // Verify generation started
    // The effect dispatches uiRequestGeneration which triggers GenX
    // Since we mocked genX, we can check if generate was called.
    // But we are passing a mock to registerEffects.

    // Wait, genX.generate is async. We mocked it.
    expect(genXMock.generate).toHaveBeenCalled();
  });
});
