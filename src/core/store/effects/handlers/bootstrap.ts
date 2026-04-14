import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { trimStopTail } from "../../../utils/config";
import { buildBootstrapContinueStrategy } from "../bootstrap-effects";
import { generationSubmitted, requestQueued } from "../../index";

type BootstrapTarget = Extract<GenerationStrategy["target"], { type: "bootstrap" }>;
type BootstrapContinueTarget = Extract<GenerationStrategy["target"], { type: "bootstrapContinue" }>;

const MAX_CONTINUE_ITERATIONS = 5; // iterations 0–4 → 5 continuation paragraphs

// When true, the next Phase 2 iteration should join the last document section inline
// rather than starting a new paragraph. Set when a generation ends mid-sentence
// (max_tokens fired before a natural \n\n boundary). Reset on completion or failure.
let continueInline = false;

function parseParagraphs(text: string): string[] {
  return stripThinkingTags(text)
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[\*\-#=~\s]+$/.test(p));
}

/** True when text ended at a natural sentence/scene boundary (not mid-sentence max_tokens cut). */
function endsAtBoundary(text: string): boolean {
  return /[.!?…]["']?$/.test(text) || text.endsWith("***") || text.endsWith("---") || text.endsWith("⁂");
}

/** Join text onto the last document section without creating a new paragraph. */
async function joinToLastSection(text: string): Promise<void> {
  const ids = await api.v1.document.sectionIds();
  const lastId = ids[ids.length - 1];
  const results = await api.v1.document.scan(undefined, { from: lastId });
  const lastText = results[0].section.text;
  await api.v1.document.updateParagraph(lastId, { text: lastText + " " + text });
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
      // If Phase 1 ended mid-sentence, Phase 2 iter 0 must join inline.
      continueInline = !endsAtBoundary(paragraph);
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
      continueInline = false;
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const text = trimStopTail(
      stripThinkingTags(ctx.accumulatedText),
      ["\n***", "\n---", "\n⁂", "\n[ "],
    ).trim();
    if (text) {
      if (continueInline) {
        // Previous generation ended mid-sentence — join onto its section inline.
        await joinToLastSection(text);
      } else {
        await api.v1.document.appendParagraph({ text });
      }
      continueInline = !endsAtBoundary(text);
    }

    const maxReached = ctx.target.iteration >= MAX_CONTINUE_ITERATIONS - 1;
    if (maxReached) {
      continueInline = false;
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
