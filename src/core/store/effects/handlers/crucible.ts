import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  goalTextUpdated,
  directionSet,
  shapeDetected,
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
type CrucibleShapeDetectionTarget = { type: "crucibleShapeDetection" };
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

// --- Shape Detection Handler ---

const VALID_SHAPES = new Set([
  "CLIMACTIC_CHOICE",
  "SPIRAL_DESCENT",
  "THRESHOLD_CROSSING",
  "EQUILIBRIUM_RESTORED",
  "ACCUMULATED_WEIGHT",
  "REVELATION",
]);

export const shapeDetectionHandler: GenerationHandlers<CrucibleShapeDetectionTarget> = {
  streaming(ctx: StreamingContext<CrucibleShapeDetectionTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.TICKER_TEXT, text: text.slice(-60) }]);
  },

  async completion(ctx: CompletionContext<CrucibleShapeDetectionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    // accumulatedText includes the prefill "SHAPE: " — extract the value after it
    const shapeMatch = text.match(/SHAPE:\s*([A-Z_]+)/);
    const raw = shapeMatch ? shapeMatch[1].trim() : "";
    const shape = VALID_SHAPES.has(raw) ? raw : "CLIMACTIC_CHOICE";

    if (!VALID_SHAPES.has(raw)) {
      api.v1.log("[crucible] Shape parse: unrecognised shape, defaulting to CLIMACTIC_CHOICE");
      api.v1.log("[crucible] Raw text:", text.slice(0, 200));
    } else {
      api.v1.log(`[crucible] Shape detected: ${shape}`);
    }

    ctx.dispatch(shapeDetected({ shape }));
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

    const goalText = parseTag(text, "GOAL");
    if (goalText) {
      const why = parseTag(text, "WHY") || "";
      ctx.dispatch(goalTextUpdated({ goalId, text, why }));
    } else {
      api.v1.log("[crucible] Goal parse: missing [GOAL]");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};
