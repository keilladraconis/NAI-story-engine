import { describe, it, expect, vi } from "vitest";
import { foundationHandler } from "../../../../../src/core/store/effects/handlers/foundation";
import {
  readStream,
  clearStream,
} from "../../../../../src/core/store/stream-buffer";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type { GenerationStrategy } from "../../../../../src/core/store/types";

type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;

function makeCtx(
  over: Partial<CompletionContext<FoundationTarget>> = {},
): CompletionContext<FoundationTarget> {
  return {
    target: { type: "foundation", field: "intent" },
    getState: vi.fn(),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<FoundationTarget>;
}

describe("foundationHandler.streaming", () => {
  it("writes accumulatedText to the foundation stream buffer, no dispatch", () => {
    clearStream("foundation:intent");
    const ctx = makeCtx({ accumulatedText: "Explore themes of" });
    foundationHandler.streaming(ctx, "of");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("foundation:intent")).toBe("Explore themes of");
    clearStream("foundation:intent");
  });
});

describe("foundationHandler.completion", () => {
  it("dispatches intentUpdated and clears the buffer on success", async () => {
    clearStream("foundation:intent");
    const streamCtx = makeCtx({ accumulatedText: "partial" });
    foundationHandler.streaming(streamCtx, "partial");
    expect(readStream("foundation:intent")).toBe("partial");
    const ctx = makeCtx({ accumulatedText: "Explore inherited trauma" });
    await foundationHandler.completion(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "foundation/intentUpdated",
      payload: { intent: "Explore inherited trauma" },
    });
    expect(readStream("foundation:intent")).toBeUndefined();
  });

  it("clears the buffer and does not dispatch when generation failed", async () => {
    clearStream("foundation:intent");
    foundationHandler.streaming(
      makeCtx({ accumulatedText: "partial" }),
      "partial",
    );
    const ctx = makeCtx({
      accumulatedText: "partial",
      generationSucceeded: false,
    });
    await foundationHandler.completion(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("foundation:intent")).toBeUndefined();
  });
});
