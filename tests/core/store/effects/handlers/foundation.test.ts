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
    target: { type: "foundation", field: "situation" },
    getState: vi.fn(),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<FoundationTarget>;
}

describe("foundationHandler.streaming", () => {
  it("writes accumulatedText to the foundation stream buffer, no dispatch", () => {
    clearStream("foundation:situation");
    const ctx = makeCtx({ accumulatedText: "Explore themes of" });
    foundationHandler.streaming(ctx, "of");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("foundation:situation")).toBe("Explore themes of");
    clearStream("foundation:situation");
  });
});

describe("foundationHandler.completion", () => {
  it("dispatches situationUpdated, trimmed, and clears the buffer on success", async () => {
    clearStream("foundation:situation");
    const streamCtx = makeCtx({ accumulatedText: "partial" });
    foundationHandler.streaming(streamCtx, "partial");
    expect(readStream("foundation:situation")).toBe("partial");
    const ctx = makeCtx({ accumulatedText: "  The company is buying.  " });
    await foundationHandler.completion(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "foundation/situationUpdated",
      payload: { situation: "The company is buying." },
    });
    expect(readStream("foundation:situation")).toBeUndefined();
  });

  it("clears the buffer and does not dispatch when generation failed", async () => {
    clearStream("foundation:situation");
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
    expect(readStream("foundation:situation")).toBeUndefined();
  });
});
