import { describe, it, expect, vi } from "vitest";
import {
  chatHandler,
  chatRefineHandler,
} from "../../../../../src/core/store/effects/handlers/chat";
import {
  chatSliceReducer,
  initialChatState,
  chatCreated,
  messageAdded,
  forgeSegmentsSet,
} from "../../../../../src/core/store/slices/chat";
import {
  readStream,
  clearStream,
} from "../../../../../src/core/store/stream-buffer";
import type { ForgeSegment } from "../../../../../src/core/chat-types/types";
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
    target: {
      type: "chatRefine",
      chatId: "r1",
      messageId: "m1",
      fieldId: "attg",
    },
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
  it("commits the field without the refine framing around it", async () => {
    // Observed on an ATTG refine: the model reproduced the `=== REFINE TARGET
    // ===` header it was shown and the header was committed as part of the
    // field. Nothing downstream would catch it — a candidate with scaffolding
    // in it looks exactly like a candidate.
    const ctx = makeRefineCtx({
      accumulatedText:
        "=== REFINE TARGET (attg) ===\n[ Fantasy; Ada; adventure ]\n=== END TARGET ===",
    });
    await chatRefineHandler.completion(ctx);
    const updated = (
      ctx.dispatch as unknown as ReturnType<typeof vi.fn>
    ).mock.calls
      .map((c) => c[0])
      .find((a) => a.type === "chat/messageUpdated");
    expect(updated).toBeDefined();
    expect(updated.payload.content).toBe("[ Fantasy; Ada; adventure ]");
  });

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
        payload: { chatId: "r1", messageId: "m1" },
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
  // Streaming no longer dispatches per token — it appends to the effect-free
  // stream-buffer keyed by message id (per-token store dispatch wedges the JSX
  // render flush). It must NOT dispatch, and must grow the buffer by the delta.
  it("chat streaming appends the delta to the stream buffer, no dispatch", () => {
    clearStream("m1");
    const dispatch = vi.fn();
    const ctx = {
      target: { type: "chat" as const, chatId: "c1", messageId: "m1" },
      getState: vi.fn(),
      dispatch,
      accumulatedText: "Hello",
    };
    chatHandler.streaming(ctx, "Hello");
    chatHandler.streaming(ctx, " world");
    expect(dispatch).not.toHaveBeenCalled();
    expect(readStream("m1")).toBe("Hello world");
    clearStream("m1");
  });

  it("chatRefine streaming appends the delta to the stream buffer, no dispatch", () => {
    clearStream("m1");
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
    chatRefineHandler.streaming(ctx, "tighter");
    chatRefineHandler.streaming(ctx, " version");
    expect(dispatch).not.toHaveBeenCalled();
    expect(readStream("m1")).toBe("tighter version");
    clearStream("m1");
  });

  it("chat completion commits the text and clears the buffer", async () => {
    clearStream("m1");
    const streamCtx = {
      target: { type: "chat" as const, chatId: "c1", messageId: "m1" },
      getState: vi.fn(),
      dispatch: vi.fn(),
      accumulatedText: "partial",
    };
    chatHandler.streaming(streamCtx, "partial");
    expect(readStream("m1")).toBe("partial");
    const ctx = makeChatCtx({ accumulatedText: "done" });
    await chatHandler.completion(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "chat/messageUpdated",
      payload: { chatId: "c1", id: "m1", content: "done" },
    });
    expect(readStream("m1")).toBeUndefined();
  });
});

describe("chat slice — forgeSegmentsSet", () => {
  it("attaches segments to the matching message", () => {
    let state = initialChatState;
    state = chatSliceReducer(
      state,
      chatCreated({
        chat: {
          id: "c1",
          type: "forge",
          title: "F",
          messages: [],
          seed: { kind: "blank" },
        },
      }),
    );
    state = chatSliceReducer(
      state,
      messageAdded({
        chatId: "c1",
        message: { id: "m1", role: "assistant", content: "raw" },
      }),
    );
    const segments: ForgeSegment[] = [
      { kind: "prose", text: "hi" },
      {
        kind: "action",
        action: {
          kind: "CREATE",
          status: "applied",
          elementType: "SYSTEM",
          name: "X",
        },
      },
    ];
    state = chatSliceReducer(
      state,
      forgeSegmentsSet({ chatId: "c1", id: "m1", segments }),
    );
    const msg = state.chats
      .find((c) => c.id === "c1")!
      .messages.find((m) => m.id === "m1")!;
    expect(msg.forgeSegments).toEqual(segments);
  });
});
