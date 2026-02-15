import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleBeat,
  Constraint,
} from "../../types";
import {
  goalTextUpdated,
  beatAdded,
  chainCompleted,
  checkpointSet,
  intentSet,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  parseTagList,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

// --- Types for crucible targets ---

type CrucibleIntentTarget = { type: "crucibleIntent" };
type CrucibleGoalTarget = { type: "crucibleGoal"; goalId: string };
type CrucibleChainTarget = { type: "crucibleChain"; goalId: string };

// --- Intent Handler ---

export const crucibleIntentHandler: GenerationHandlers<CrucibleIntentTarget> = {
  streaming(ctx: StreamingContext<CrucibleIntentTarget>): void {
    const clean = stripThinkingTags(ctx.accumulatedText);
    const display = clean.replace(/\n/g, "  \n").replace(/</g, "\\<");
    api.v1.ui.updateParts([{ id: `${IDS.CRUCIBLE.INTENT_TEXT}-view`, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleIntentTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    if (text.length > 0) {
      ctx.dispatch(intentSet({ intent: text }));
    } else {
      api.v1.log("[crucible] Intent generation produced empty text");
    }
  },
};

// --- Per-Goal Handler ---

export const crucibleGoalHandler: GenerationHandlers<CrucibleGoalTarget> = {
  streaming(ctx: StreamingContext<CrucibleGoalTarget>): void {
    const { goalId } = ctx.target;
    const display = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText));
    api.v1.ui.updateParts([{ id: `${IDS.CRUCIBLE.goal(goalId).TEXT}-view`, text: display }]);
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

// --- Chain Handler (Lean Solver) ---

export const crucibleChainHandler: GenerationHandlers<CrucibleChainTarget> = {
  streaming(ctx: StreamingContext<CrucibleChainTarget>): void {
    const display = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText));
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleChainTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const state = ctx.getState();
    const chain = state.crucible.chains[goalId];
    if (!chain) return;

    try {
      const text = stripThinkingTags(ctx.accumulatedText).trim();

      if (!parseTag(text, "SCENE")) {
        api.v1.log("[crucible] Chain parse: missing [SCENE]");
        return;
      }

      const constraintsResolved = parseTagList(text, "RESOLVED");
      const newOpenConstraints = parseTagList(text, "OPEN");
      const groundStateConstraints = parseTagList(text, "GROUND");

      const beat: CrucibleBeat = {
        text,
        constraintsResolved,
        newOpenConstraints,
        groundStateConstraints,
      };

      const beatIndex = chain.beats.length;

      const opened: Constraint[] = newOpenConstraints.map((desc) => ({
        id: api.v1.uuid(),
        description: desc,
        sourceBeatIndex: beatIndex,
        status: "open" as const,
      }));

      ctx.dispatch(beatAdded({
        goalId,
        beat,
        constraints: {
          resolved: constraintsResolved,
          opened,
          grounded: groundStateConstraints,
        },
      }));

      // --- Checkpoint detection ---
      const updatedState = ctx.getState();
      const updatedChain = updatedState.crucible.chains[goalId];
      if (!updatedChain) return;

      // Constraint explosion: net growth >2 for 3 consecutive beats
      if (updatedChain.beats.length >= 3) {
        const lastThree = updatedChain.beats.slice(-3);
        const explosionCount = lastThree.filter(
          (b) => b.newOpenConstraints.length - b.constraintsResolved.length > 2,
        ).length;
        if (explosionCount >= 3) {
          ctx.dispatch(checkpointSet({ reason: "Constraint explosion — open constraints growing faster than resolving" }));
        }
      }

      // Beat count threshold
      if (updatedChain.beats.length >= 15) {
        ctx.dispatch(checkpointSet({ reason: "Chain reached 15 beats — consider consolidating" }));
      }

      // Chain completion: all open constraints resolved
      if (updatedChain.openConstraints.length === 0 && updatedChain.beats.length > 0) {
        ctx.dispatch(chainCompleted({ goalId }));
      }
    } catch (e) {
      api.v1.log("[crucible] Chain parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
