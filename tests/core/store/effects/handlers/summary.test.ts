import { describe, it, expect, vi } from "vitest";
import {
  entitySummaryHandler,
  threadSummaryHandler,
} from "../../../../../src/core/store/effects/handlers/summary";
import {
  readStream,
  clearStream,
  writeStream as writeStreamForTest,
} from "../../../../../src/core/store/stream-buffer";
import type {
  CompletionContext,
  StreamingContext,
} from "../../../../../src/core/store/effects/generation-handlers";
import type { GenerationStrategy } from "../../../../../src/core/store/types";

type EntitySummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummary" }
>;

function makeCtx(
  over: Partial<CompletionContext<EntitySummaryTarget>> = {},
): CompletionContext<EntitySummaryTarget> {
  return {
    target: { type: "entitySummary", entityId: "e1" },
    getState: () => ({ ui: { activeEditId: null } }),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<EntitySummaryTarget>;
}

describe("entitySummaryHandler.streaming", () => {
  it("writes accumulatedText to the entity-summary buffer, no dispatch", () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({ accumulatedText: "A sterile lab" });
    entitySummaryHandler.streaming(ctx, "lab");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("entity-summary:e1")).toBe("A sterile lab");
    clearStream("entity-summary:e1");
  });
});

describe("entitySummaryHandler.completion", () => {
  it("pane CLOSED: writes trimmed final to the buffer AND dispatches entitySummaryUpdated", async () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({
      accumulatedText: "  A sterile research lab  ",
      getState: () => ({ ui: { activeEditId: null } }) as never,
    });
    await entitySummaryHandler.completion(ctx);
    expect(readStream("entity-summary:e1")).toBe("A sterile research lab");
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "world/entitySummaryUpdated",
      payload: { entityId: "e1", summary: "A sterile research lab" },
    });
    clearStream("entity-summary:e1");
  });

  it("pane OPEN: writes trimmed final to the buffer AND does NOT dispatch", async () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({
      accumulatedText: "  A sterile research lab  ",
      getState: () => ({ ui: { activeEditId: "e1" } }) as never,
    });
    await entitySummaryHandler.completion(ctx);
    expect(readStream("entity-summary:e1")).toBe("A sterile research lab");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    clearStream("entity-summary:e1");
  });
});

type ThreadSummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "threadSummary" }
>;

function makeThreadCtx(
  over: Partial<CompletionContext<ThreadSummaryTarget>> = {},
): CompletionContext<ThreadSummaryTarget> {
  return {
    target: { type: "threadSummary", groupId: "g1" },
    getState: () => ({ ui: { activeEditId: "g1" } }),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<ThreadSummaryTarget>;
}

describe("threadSummaryHandler.streaming", () => {
  it("writes accumulatedText to the thread-summary buffer", () => {
    clearStream("thread-summary:g1");
    const ctx = makeThreadCtx({ accumulatedText: "A rivalry" });
    threadSummaryHandler.streaming(
      ctx as unknown as StreamingContext<ThreadSummaryTarget>,
      "rivalry",
    );
    expect(readStream("thread-summary:g1")).toBe("A rivalry");
    clearStream("thread-summary:g1");
  });
});

describe("threadSummaryHandler.completion", () => {
  it("success: writes the trimmed final to the buffer", async () => {
    clearStream("thread-summary:g1");
    const ctx = makeThreadCtx({ accumulatedText: "  A tense rivalry  " });
    await threadSummaryHandler.completion(ctx);
    expect(readStream("thread-summary:g1")).toBe("A tense rivalry");
    clearStream("thread-summary:g1");
  });

  it("failure: clears the buffer", async () => {
    clearStream("thread-summary:g1");
    writeStreamForTest("thread-summary:g1", "stale");
    const ctx = makeThreadCtx({
      accumulatedText: "",
      generationSucceeded: false,
    });
    await threadSummaryHandler.completion(ctx);
    expect(readStream("thread-summary:g1")).toBeUndefined();
  });
});
