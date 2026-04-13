import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

type BootstrapTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrap" }
>;

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  streaming(ctx: StreamingContext<BootstrapTarget>, _newText: string): void {
    // Show a rolling tail of the accumulated prose in the header status area
    const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
    api.v1.ui.updateParts([{ id: "header-sega-status", text: tail }]);
  },

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Race protection: bail if document was populated while we were generating
    const sectionIds = await api.v1.document.sectionIds();
    if (sectionIds.length > 0) {
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const paragraphs = ctx.accumulatedText
      .trim()
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.length > 0) {
      await api.v1.document.appendParagraphs(
        paragraphs.map((text) => ({ text })),
      );
    }

    api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
  },
};
