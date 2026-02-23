import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  goalTextUpdated,
  directionSet,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

// --- Types for crucible targets ---

type CrucibleDirectionTarget = { type: "crucibleDirection" };
type CrucibleGoalTarget = { type: "crucibleGoal"; goalId: string };

// --- Direction Handler ---

export const crucibleDirectionHandler: GenerationHandlers<CrucibleDirectionTarget> = {
  streaming(ctx: StreamingContext<CrucibleDirectionTarget>): void {
    const clean = stripThinkingTags(ctx.accumulatedText);
    const display = clean.replace(/\n/g, "  \n").replace(/</g, "\\<");
    const tail = clean.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([
      { id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: display },
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<CrucibleDirectionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    if (text.length > 0) {
      ctx.dispatch(directionSet({ direction: text }));
    } else {
      api.v1.log("[crucible] Direction generation produced empty text");
    }
  },
};

// --- Per-Goal Handler ---

export const crucibleGoalHandler: GenerationHandlers<CrucibleGoalTarget> = {
  streaming(ctx: StreamingContext<CrucibleGoalTarget>): void {
    const { goalId } = ctx.target;
    const stripped = stripThinkingTags(ctx.accumulatedText);
    const display = formatTagsWithEmoji(stripped);
    const tail = stripped.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([
      { id: `${IDS.CRUCIBLE.goal(goalId).TEXT}-view`, text: display },
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<CrucibleGoalTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const text = stripThinkingTags(ctx.accumulatedText).trim();

    if (parseTag(text, "GOAL")) {
      ctx.dispatch(goalTextUpdated({ goalId, text }));
    } else {
      api.v1.log("[crucible] Goal parse: missing [GOAL]");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};
