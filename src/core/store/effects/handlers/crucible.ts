import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleBeat,
  Constraint,
  MergedElement,
  MergedElementType,
} from "../../types";
import {
  goalTextUpdated,
  beatAdded,
  chainCompleted,
  checkpointSet,
  mergedWorldSet,
  intentSet,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  parseTagList,
  splitSections,
  parseWorldElementLines,
  formatTagsWithEmoji,
} from "../../../utils/tag-parser";

// --- Types for crucible targets ---

type CrucibleIntentTarget = { type: "crucibleIntent" };
type CrucibleGoalTarget = { type: "crucibleGoal"; goalId: string };
type CrucibleChainTarget = { type: "crucibleChain"; goalId: string };
type CrucibleMergeTarget = { type: "crucibleMerge" };

const VALID_ELEMENT_TYPES = new Set<string>(["character", "location", "faction", "system", "situation"]);

// --- Intent Handler ---

export const crucibleIntentHandler: GenerationHandlers<CrucibleIntentTarget> = {
  streaming(ctx: StreamingContext<CrucibleIntentTarget>): void {
    // Stream raw prose — only escape line breaks and angle brackets for markdown
    const display = ctx.accumulatedText.replace(/\n/g, "  \n").replace(/</g, "\\<");
    api.v1.ui.updateParts([{ id: `${IDS.CRUCIBLE.INTENT_TEXT}-view`, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleIntentTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = ctx.accumulatedText.trim();
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
    const display = formatTagsWithEmoji(ctx.accumulatedText);
    // Write to EditableText's view element (${id}-view)
    api.v1.ui.updateParts([{ id: `${IDS.CRUCIBLE.goal(goalId).TEXT}-view`, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleGoalTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const text = ctx.accumulatedText.trim();

    if (parseTag(text, "GOAL")) {
      ctx.dispatch(goalTextUpdated({ goalId, text }));
    } else {
      api.v1.log("[crucible] Goal parse: missing [GOAL]");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};

// --- Chain Handler ---

export const crucibleChainHandler: GenerationHandlers<CrucibleChainTarget> = {
  streaming(ctx: StreamingContext<CrucibleChainTarget>): void {
    const display = formatTagsWithEmoji(ctx.accumulatedText);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleChainTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const state = ctx.getState();
    const chain = state.crucible.chains[goalId];
    if (!chain) return;

    try {
      const text = ctx.accumulatedText.trim();

      // Validate: must have [SCENE]
      if (!parseTag(text, "SCENE")) {
        api.v1.log("[crucible] Chain parse: missing [SCENE]");
        return;
      }

      const worldElements = parseWorldElementLines(text);
      const constraintsResolved = parseTagList(text, "RESOLVED");
      const newOpenConstraints = parseTagList(text, "OPEN");
      const groundStateConstraints = parseTagList(text, "GROUND");

      const beat: CrucibleBeat = {
        text,
        worldElementsIntroduced: worldElements,
        constraintsResolved,
        newOpenConstraints,
        groundStateConstraints,
      };

      const beatIndex = chain.beats.length; // index of the new beat

      // Build constraint update objects
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

      // (a) Major character introduction (1st or 2nd character across beats)
      const totalChars = updatedChain.worldElements.characters.length;
      const newChars = beat.worldElementsIntroduced.characters.length;
      if (newChars > 0 && totalChars <= 2) {
        ctx.dispatch(checkpointSet({ reason: `Major character introduced: ${beat.worldElementsIntroduced.characters.map((c) => c.name).join(", ")}` }));
      }

      // (b) Constraint explosion: net growth >2 for 3 consecutive beats
      if (updatedChain.beats.length >= 3) {
        const lastThree = updatedChain.beats.slice(-3);
        const explosionCount = lastThree.filter(
          (b) => b.newOpenConstraints.length - b.constraintsResolved.length > 2,
        ).length;
        if (explosionCount >= 3) {
          ctx.dispatch(checkpointSet({ reason: "Constraint explosion — open constraints growing faster than resolving" }));
        }
      }

      // (c) Beat count threshold
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

// --- Merge Handler ---

export const crucibleMergeHandler: GenerationHandlers<CrucibleMergeTarget> = {
  streaming(ctx: StreamingContext<CrucibleMergeTarget>): void {
    const display = formatTagsWithEmoji(ctx.accumulatedText);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.STREAM_TEXT, text: display }]);
  },

  async completion(ctx: CompletionContext<CrucibleMergeTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const sections = splitSections(ctx.accumulatedText);
      if (sections.length === 0) {
        api.v1.log("[crucible] Merge parse: no sections found");
        return;
      }

      const elements: MergedElement[] = [];
      for (const section of sections) {
        const name = parseTag(section, "NAME");
        const type = parseTag(section, "TYPE");
        if (!name || !type) continue;
        if (!VALID_ELEMENT_TYPES.has(type.toLowerCase())) continue;

        elements.push({
          text: section,
          type: type.toLowerCase() as MergedElementType,
          name,
        });
      }

      if (elements.length > 0) {
        ctx.dispatch(mergedWorldSet({ mergedWorld: { elements } }));
      }
    } catch (e) {
      api.v1.log("[crucible] Merge parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
