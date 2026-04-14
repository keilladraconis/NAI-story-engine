import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { buildBootstrapContinueStrategy } from "../bootstrap-effects";
import { generationSubmitted, requestQueued } from "../../index";

type BootstrapTarget = Extract<GenerationStrategy["target"], { type: "bootstrap" }>;
type BootstrapContinueTarget = Extract<GenerationStrategy["target"], { type: "bootstrapContinue" }>;

const MAX_CONTINUE_ITERATIONS = 5; // iterations 0–4 → 5 continuation paragraphs

function parseParagraphs(text: string): string[] {
  return stripThinkingTags(text)
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[\*\-#=~\s]+$/.test(p));
}

// ─── Phase 1 handler ─────────────────────────────────────────────────────────

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  streaming(ctx: StreamingContext<BootstrapTarget>, _newText: string): void {
    const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
    api.v1.ui.updateParts([{ id: "header-sega-status", text: tail }]);
  },

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Race protection: bail if document was populated while generating
    const sectionIds = await api.v1.document.sectionIds();
    if (sectionIds.length > 0) {
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const paragraph = parseParagraphs(ctx.accumulatedText)[0];
    if (paragraph) {
      await api.v1.document.appendParagraph({ text: paragraph });
    }

    // Chain into phase 2
    const strategy = buildBootstrapContinueStrategy(ctx.getState, 0);
    ctx.dispatch(
      requestQueued({ id: strategy.requestId, type: "bootstrapContinue", targetId: "bootstrap" }),
    );
    ctx.dispatch(generationSubmitted(strategy));
  },
};

// ─── Phase 2 handler ─────────────────────────────────────────────────────────

export const bootstrapContinueHandler: GenerationHandlers<BootstrapContinueTarget> = {
  streaming(ctx: StreamingContext<BootstrapContinueTarget>, _newText: string): void {
    const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
    api.v1.ui.updateParts([{ id: "header-sega-status", text: `[${ctx.target.iteration + 2}] ${tail}` }]);
  },

  async completion(ctx: CompletionContext<BootstrapContinueTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) {
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    if (text) {
      await api.v1.document.append(text);
    }

    const maxReached = ctx.target.iteration >= MAX_CONTINUE_ITERATIONS - 1;
    if (maxReached) {
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    // Queue next iteration
    const strategy = buildBootstrapContinueStrategy(ctx.getState, ctx.target.iteration + 1);
    ctx.dispatch(
      requestQueued({ id: strategy.requestId, type: "bootstrapContinue", targetId: "bootstrap" }),
    );
    ctx.dispatch(generationSubmitted(strategy));
  },
};
