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
  parseTagAll,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";

// --- Append-only stream transcript (module-level, not Redux) ---

let _streamTranscript = "";
export function getStreamTranscript(): string { return _streamTranscript; }
export function appendToTranscript(chunk: string): void {
  _streamTranscript += (_streamTranscript ? "\n\n---\n\n" : "") + chunk;
}
export function resetStreamTranscript(): void { _streamTranscript = ""; }

const STREAM_WORD_LIMIT = 30;
/** Keep only the last ~30 words for the streaming ticker. Flattens newlines to spaces. */
export function truncateToTail(text: string): string {
  const flat = text.replace(/\n+/g, " ");
  const words = flat.split(/\s+/);
  if (words.length <= STREAM_WORD_LIMIT) return flat;
  return "\u2026 " + words.slice(-STREAM_WORD_LIMIT).join(" ");
}

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
    const liveChunk = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText));
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: truncateToTail(liveChunk) }]);
  },

  async completion(ctx: CompletionContext<CrucibleChainTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Append completed chunk to persistent transcript
    const cleanText = formatTagsWithEmoji(stripThinkingTags(ctx.accumulatedText).trim());
    if (cleanText) appendToTranscript(cleanText);

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

      // Build reverse map: shortId → constraint (direct from constraint.shortId)
      const shortIdToConstraint = new Map<string, Constraint>();
      for (const c of chain.openConstraints) {
        shortIdToConstraint.set(c.shortId.toUpperCase(), c);
      }

      /** Extract shortId from an item string.
       *  Matches [ID:Xn] (canonical) or bare [Xn] (common GLM mistake).
       *  Returns the shortId if found and it maps to a known constraint, else null. */
      const resolveShortId = (item: string): string | null => {
        const idMatch = item.match(/\[ID:(X\d+)\]/i) || item.match(/\[(X\d+)\]/i);
        if (idMatch) {
          const key = idMatch[1].toUpperCase();
          if (shortIdToConstraint.has(key)) return key;
        }
        return null;
      };

      // Parse one-per-line tagged constraints
      const rawResolved = parseTagAll(text, "RESOLVED");
      const rawOpen = parseTagAll(text, "OPEN");

      // Resolved: extract shortIds. Items marked "ground" go to groundState.
      const constraintsResolved: string[] = [];
      const groundStateConstraints: string[] = [];
      for (const item of rawResolved) {
        const sid = resolveShortId(item);
        if (!sid) continue;
        if (/\bground\b/i.test(item)) {
          groundStateConstraints.push(sid);
        } else {
          constraintsResolved.push(sid);
        }
      }

      // Open: strip any stray IDs, keep description text
      const newOpenConstraints = rawOpen
        .map((s) => s.replace(/\[ID:\w+\]\s*/g, "").replace(/\[X\d+\]\s*/gi, "").trim())
        .filter((s) => s.length > 0);

      const beat: CrucibleBeat = {
        text,
        constraintsResolved,       // shortIds
        newOpenConstraints,         // description strings (new constraints don't have IDs yet)
        groundStateConstraints,     // shortIds
      };

      const beatIndex = chain.beats.length;

      // opened constraints: shortId will be assigned by the reducer
      const opened: Constraint[] = newOpenConstraints.map((desc) => ({
        id: api.v1.uuid(),
        shortId: "", // placeholder — reducer assigns monotonic shortId
        description: desc,
        sourceBeatIndex: beatIndex,
        status: "open" as const,
      }));

      ctx.dispatch(beatAdded({
        goalId,
        beat,
        constraints: {
          resolved: constraintsResolved,   // shortIds
          opened,
          grounded: groundStateConstraints, // shortIds
        },
      }));

      // Seed BeatCard storyStorage + populate view
      api.v1.storyStorage.set(`cr-beat-${goalId}-${beatIndex}`, text);
      const beatViewId = `${IDS.CRUCIBLE.beat(goalId, beatIndex).TEXT}-view`;
      const beatDisplay = formatTagsWithEmoji(text)
        .replace(/\n/g, "  \n").replace(/</g, "\\<");
      api.v1.ui.updateParts([{ id: beatViewId, text: beatDisplay }]);

      // --- Checkpoint detection ---
      const updatedState = ctx.getState();
      const updatedChain = updatedState.crucible.chains[goalId];
      if (!updatedChain) return;

      // Constraint explosion: net growth >1 for 3 consecutive beats
      if (updatedChain.beats.length >= 3) {
        const lastThree = updatedChain.beats.slice(-3);
        const explosionCount = lastThree.filter(
          (b) => b.newOpenConstraints.length - b.constraintsResolved.length > 1,
        ).length;
        if (explosionCount >= 3) {
          ctx.dispatch(checkpointSet({ reason: "The story is getting complex. Review and continue, or step back." }));
        }
      }

      // Beat count threshold
      if (updatedChain.beats.length >= 15) {
        ctx.dispatch(checkpointSet({ reason: "This goal has developed extensively. Continue or step back." }));
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
