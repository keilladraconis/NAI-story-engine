import {
  GenerationHandlers,
  BootstrapTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  // No streaming preview needed - generation produces instruction text
  streaming(_ctx: StreamingContext<BootstrapTarget>, _newText: string): void {
    // No-op: bootstrap generation doesn't preview to UI
  },

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) {
      return;
    }

    // Split by double newlines to create separate paragraphs
    const paragraphs = ctx.accumulatedText
      .trim()
      .split(/\n\n+/)
      .filter((p) => p.trim());

    // Append each paragraph separately to preserve line breaks
    for (const paragraph of paragraphs) {
      await api.v1.document.appendParagraph({
        text: paragraph.trim(),
        source: "instruction",
      });
    }

    api.v1.ui.toast("Scene opening generated", { type: "success" });
  },
};
