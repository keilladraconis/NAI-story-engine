import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleScene,
  Constraint,
} from "../../types";
import {
  goalTextUpdated,
  sceneAdded,
  chainCompleted,
  directionSet,
  directorGuidanceConsumed,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  parseTagAll,
  formatTagsWithEmoji,
  stripSceneTag,
} from "../../../utils/tag-parser";
import { getMaxScenes } from "../../../utils/crucible-strategy";

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

type CrucibleDirectionTarget = { type: "crucibleDirection" };
type CrucibleGoalTarget = { type: "crucibleGoal"; goalId: string };
type CrucibleChainTarget = { type: "crucibleChain"; goalId: string };

// --- Direction Handler ---

export const crucibleDirectionHandler: GenerationHandlers<CrucibleDirectionTarget> = {
  streaming(ctx: StreamingContext<CrucibleDirectionTarget>): void {
    const clean = stripThinkingTags(ctx.accumulatedText);
    const display = clean.replace(/\n/g, "  \n").replace(/</g, "\\<");
    api.v1.ui.updateParts([{ id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: display }]);
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

      const scene: CrucibleScene = {
        text,
        constraintsResolved,       // shortIds
        newOpenConstraints,         // description strings (new constraints don't have IDs yet)
        groundStateConstraints,     // shortIds
      };

      const sceneIndex = chain.scenes.length;

      // opened constraints: shortId will be assigned by the reducer
      const opened: Constraint[] = newOpenConstraints.map((desc) => ({
        id: api.v1.uuid(),
        shortId: "", // placeholder — reducer assigns monotonic shortId
        description: desc,
        sourceSceneIndex: sceneIndex,
        status: "open" as const,
      }));

      ctx.dispatch(sceneAdded({
        goalId,
        scene,
        constraints: {
          resolved: constraintsResolved,   // shortIds
          opened,
          grounded: groundStateConstraints, // shortIds
        },
      }));

      ctx.dispatch(directorGuidanceConsumed({ by: "solver" }));

      // Seed SceneCard storyStorage + populate view
      api.v1.storyStorage.set(`cr-scene-${goalId}-${sceneIndex}`, text);
      const sceneViewId = `${IDS.CRUCIBLE.scene(goalId, sceneIndex).TEXT}-view`;
      const sceneDisplay = formatTagsWithEmoji(stripSceneTag(text))
        .replace(/\n/g, "  \n").replace(/</g, "\\<");
      api.v1.ui.updateParts([{ id: sceneViewId, text: sceneDisplay }]);

      // --- Checkpoint detection ---
      const updatedState = ctx.getState();
      const updatedChain = updatedState.crucible.chains[goalId];
      if (!updatedChain) return;

      // Chain completion: Solver produced an [OPENER] scene
      if (parseTag(text, "OPENER")) {
        api.v1.log(`[crucible] Opener detected at scene ${sceneIndex + 1} — chain complete`);
        ctx.dispatch(chainCompleted({ goalId }));
      } else if (!updatedChain.complete) {
        const maxScenes = await getMaxScenes();
        if (updatedChain.scenes.length >= maxScenes) {
          api.v1.log(`[crucible] Scene budget reached (${maxScenes}) — chain complete`);
          ctx.dispatch(chainCompleted({ goalId }));
        }
      }
    } catch (e) {
      api.v1.log("[crucible] Chain parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
