import {
  GenerationHandlers,
  BootstrapTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

// --- Streaming state (reset per generation) ---
let buffer = "";
let activeSectionId: number | null = null;
let opChain: Promise<void> = Promise.resolve();
let updatePending = false;
let streamActive = false;

/** Serialize an async document operation onto the chain. */
function enqueue(fn: () => Promise<void>): void {
  opChain = opChain.then(fn);
}

/** Coalesced live update — reads buffer at execution time, skips if one is already pending. */
function scheduleLiveUpdate(): void {
  if (updatePending) return;
  updatePending = true;
  enqueue(async () => {
    updatePending = false;
    const text = buffer.trim();
    if (!text) return;
    if (activeSectionId === null) {
      await api.v1.document.appendParagraph({
        text,
        source: "instruction",
      });
      const ids = await api.v1.document.sectionIds();
      activeSectionId = ids[ids.length - 1];
    } else {
      await api.v1.document.updateParagraph(activeSectionId, {
        text,
        source: "instruction",
      });
    }
  });
}

/** Finalize a completed paragraph and reset activeSectionId so the next update creates a new one. */
function finalizeParagraph(text: string): void {
  enqueue(async () => {
    if (activeSectionId !== null) {
      await api.v1.document.updateParagraph(activeSectionId, {
        text,
        source: "instruction",
      });
    } else {
      await api.v1.document.appendParagraph({
        text,
        source: "instruction",
      });
    }
    activeSectionId = null;
  });
}

function resetState(): void {
  buffer = "";
  activeSectionId = null;
  opChain = Promise.resolve();
  updatePending = false;
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

    // Live-update the current in-progress paragraph
    scheduleLiveUpdate();
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
      if (activeSectionId !== null) {
        await api.v1.document.updateParagraph(activeSectionId, {
          text: remaining,
          source: "instruction",
        });
      } else {
        await api.v1.document.appendParagraph({
          text: remaining,
          source: "instruction",
        });
      }
    }

    resetState();
    api.v1.ui.toast("Scene opening generated", { type: "success" });
  },
};
