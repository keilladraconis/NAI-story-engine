import { describe, it, expect, vi } from "vitest";
import {
  chatHandler,
  chatRefineHandler,
} from "../../../../../src/core/store/effects/handlers/chat";
import type {
  ChatTarget,
  ChatRefineTarget,
  CompletionContext,
} from "../../../../../src/core/store/effects/generation-handlers";

function makeChatCtx(
  over: Partial<CompletionContext<ChatTarget>> = {},
): CompletionContext<ChatTarget> {
  return {
    target: { type: "chat", chatId: "c1", messageId: "m1" },
    getState: vi.fn(),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<ChatTarget>;
}

function makeRefineCtx(
  over: Partial<CompletionContext<ChatRefineTarget>> = {},
): CompletionContext<ChatRefineTarget> {
  return {
    target: { type: "chatRefine", chatId: "r1", messageId: "m1", fieldId: "attg" },
    getState: vi.fn(),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<ChatRefineTarget>;
}

describe("chatHandler.completion", () => {
  it("dispatches messageUpdated with cleaned (think-stripped) text", async () => {
    // stripThinkingTags removes literal <think>/</think> markers from the
    // accumulated stream — confirms the handler runs the cleaner before
    // dispatch so stray markers never reach the chat slice.
    const ctx = makeChatCtx({
      accumulatedText: "</think>final answer",
    });
    await chatHandler.completion(ctx);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "chat/messageUpdated",
      payload: { chatId: "c1", id: "m1", content: "final answer" },
    });
  });

  it("does nothing when accumulatedText is empty", async () => {
    const ctx = makeChatCtx({ accumulatedText: "" });
    await chatHandler.completion(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});

describe("chatRefineHandler.completion", () => {
  it("dispatches messageUpdated (routed to refine slot via chatId) and refineCandidateMarked", async () => {
    const ctx = makeRefineCtx({
      accumulatedText: "</think>cleaned candidate",
    });
    await chatRefineHandler.completion(ctx);
    const calls = (
      ctx.dispatch as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      {
        type: "chat/messageUpdated",
        payload: { chatId: "r1", id: "m1", content: "cleaned candidate" },
      },
      {
        type: "chat/refineCandidateMarked",
        payload: { messageId: "m1" },
      },
    ]);
  });

  it("does nothing when accumulatedText is empty", async () => {
    const ctx = makeRefineCtx({ accumulatedText: "" });
    await chatRefineHandler.completion(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});

describe("streaming handlers", () => {
  it("chat streaming dispatches messageAppended with the delta", () => {
    const dispatch = vi.fn();
    const ctx = {
      target: { type: "chat" as const, chatId: "c1", messageId: "m1" },
      getState: vi.fn(),
      dispatch,
      accumulatedText: "Hello",
    };
    chatHandler.streaming(ctx, " world");
    expect(dispatch).toHaveBeenCalledWith({
      type: "chat/messageAppended",
      payload: { chatId: "c1", id: "m1", content: " world" },
    });
  });

  it("chatRefine streaming dispatches messageAppended with the delta", () => {
    const dispatch = vi.fn();
    const ctx = {
      target: {
        type: "chatRefine" as const,
        chatId: "r1",
        messageId: "m1",
        fieldId: "attg",
      },
      getState: vi.fn(),
      dispatch,
      accumulatedText: "tighter",
    };
    chatRefineHandler.streaming(ctx, " version");
    expect(dispatch).toHaveBeenCalledWith({
      type: "chat/messageAppended",
      payload: { chatId: "r1", id: "m1", content: " version" },
    });
  });
});
