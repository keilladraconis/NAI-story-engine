import { describe, it, expect, vi, beforeEach } from "vitest";
import { store } from "../../../../src/core/store";
import {
  messageAdded,
  uiBrainstormRetryGeneration,
} from "../../../../src/core/store";
import { currentMessages } from "../../../../src/core/store/slices/brainstorm";
import { registerEffects } from "../../../../src/core/store/register-effects";
import { GenX } from "nai-gen-x";

describe("Brainstorm Effects", () => {
  let genXMock: GenX;

  beforeEach(() => {
    store.dispatch({ type: "brainstorm/messagesCleared" });

    vi.clearAllMocks();

    genXMock = {
      generate: vi.fn(),
      cancelAll: vi.fn(),
      userInteraction: vi.fn(),
    } as any;
    registerEffects(store, genXMock);
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 10));

  it("should handle retry generation correctly", async () => {
    const msg1 = { id: "msg-1", role: "user" as const, content: "User 1" };
    const msg2 = {
      id: "msg-2",
      role: "assistant" as const,
      content: "Assistant 1",
    };
    const msg3 = { id: "msg-3", role: "user" as const, content: "User 2" };
    const msg4 = {
      id: "msg-4",
      role: "assistant" as const,
      content: "Assistant 2",
    };

    store.dispatch(messageAdded(msg1));
    store.dispatch(messageAdded(msg2));
    store.dispatch(messageAdded(msg3));
    store.dispatch(messageAdded(msg4));

    store.dispatch(uiBrainstormRetryGeneration({ messageId: msg3.id }));
    await wait();

    const messages = currentMessages(store.getState().brainstorm);
    expect(messages.length).toBe(4); // User 1, Asst 1, User 2, NEW Asst
    expect(messages[2].id).toBe(msg3.id);
    expect(messages[3].id).not.toBe(msg4.id);
    expect(messages[3].role).toBe("assistant");
    expect(messages[3].content).toBe("");

    expect(genXMock.generate).toHaveBeenCalled();
  });
});
