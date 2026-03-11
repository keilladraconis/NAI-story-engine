import {
  GenerationHandlers,
  BootstrapTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

// --- Streaming state (reset per generation) ---
let buffer = "";
let opChain: Promise<void> = Promise.resolve();
let streamActive = false;

/** Serialize an async document operation onto the chain. */
function enqueue(fn: () => Promise<void>): void {
  opChain = opChain.then(fn);
}

/** Finalize a completed paragraph and reset activeSectionId so the next update creates a new one. */
function finalizeParagraph(text: string): void {
  enqueue(async () => {
    await api.v1.document.appendParagraph({
      text,
      source: "instruction",
      origin: [{
        position: 0,
        length: text.length,
        data: "prompt",
      }],
    });
  });
}

function resetState(): void {
  buffer = "";
  opChain = Promise.resolve();
  streamActive = false;
}

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  streaming(_ctx: StreamingContext<BootstrapTarget>, newText: string): void {
    if (!streamActive) {
      resetState();
      streamActive = true;
    }

    buffer += newText;

    // Snap off completed paragraphs at double-newline boundaries
    while (buffer.includes("\n\n")) {
      const idx = buffer.indexOf("\n\n");
      const paragraph = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (paragraph) {
        finalizeParagraph(paragraph);
      }
    }
  },

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    streamActive = false;

    if (!ctx.generationSucceeded || !ctx.accumulatedText) {
      resetState();
      return;
    }

    // Wait for all pending streaming operations to finish
    await opChain;

    // Flush remaining buffer as final paragraph
    const remaining = buffer.trim();
    if (remaining) {
      await api.v1.document.appendParagraph({
        text: remaining,
        source: "instruction",
        origin: [{
          position: 0,
          length: remaining.length,
          data: "prompt",
        }],
      });
    }

    resetState();
    api.v1.ui.toast("Scene opening generated", { type: "success" });
  },
};
