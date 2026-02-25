/**
 * Crucible Strategy — Factory functions for direction derivation, shape detection, and goals extraction.
 *
 * The three-step chain strategies (prerequisites, elements, expansion)
 * are in crucible-chain-strategy.ts.
 */

import {
  RootState,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";

// --- Shape maps (hardcoded structural knowledge, not user-configurable) ---

const SHAPE_INSTRUCTIONS: Record<string, string> = {
  CLIMACTIC_CHOICE: `Lean toward moments where two things the protagonist values become
irreconcilable. The endpoint is a configuration, not an event.`,

  SPIRAL_DESCENT: `Lean toward moments of depth recognition — where the protagonist
arrives somewhere structurally identical to where they began.
Do not imply escape, recovery, or a choice between continuing and stopping.`,

  THRESHOLD_CROSSING: `Lean toward the moment after which the protagonist cannot be what
they were — not because they overcame something, but because the crossing
made the before-self permanently past.`,

  EQUILIBRIUM_RESTORED: `Lean toward a restored stability legible precisely because of what
it carefully excludes. The equilibrium is different from the original
even where it looks identical.`,

  ACCUMULATED_WEIGHT: `Lean toward a saturation point — where all elements are simultaneously
present and the full gravity of the situation becomes legible.
Not a breaking point. Not a release. The story ends because there is nothing more to add.`,

  REVELATION: `Lean toward a disclosure that changes the meaning of every prior scene —
not by adding a new fact, but by revealing that the frame itself was the constructed object.`,
};

const SHAPE_EXAMPLES: Record<string, string> = {
  CLIMACTIC_CHOICE: `GOOD: "The colony ship arrives — but the planet is already inhabited by a civilization no record prepared them for"
GOOD: "The siblings reunite at their parent's deathbed — the parent who once chose between them"`,

  SPIRAL_DESCENT: `GOOD: "She finds the room at the centre of the house and recognises it as the room she started in — not as metaphor, but as floor plan"
GOOD: "He reaches the version of himself he was trying to become and finds it cataloguing the same losses he began with"`,

  THRESHOLD_CROSSING: `GOOD: "She is introduced to the people who loved her before and watches them search her face for someone who is no longer the resident"
GOOD: "He returns to the town and understands that the before-version of him is the town's story now, not his"`,

  EQUILIBRIUM_RESTORED: `GOOD: "The house is full again — one door stays closed, nobody mentions it, and this is what normal looks like now"
GOOD: "The business reopens. The name above the door is the same. The founding partner's desk has become a surface for leaving keys"`,

  ACCUMULATED_WEIGHT: `GOOD: "A Tuesday in the third year — the child asks a question, the parent answers it correctly, and the distance between those two facts is the whole story"
GOOD: "Everything still works. The list of what still works has become the thing she tends"`,

  REVELATION: `GOOD: "The letter was addressed to her the whole time — which means every kindness in the preceding years was navigation, not feeling"
GOOD: "The record of who was present that night is accurate. That is what makes it devastating"`,
};

// --- Factory Functions ---

/**
 * Creates a message factory for Crucible direction derivation.
 */
export const createCrucibleDirectionFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const directionPrompt = String(
      (await api.v1.config.get("crucible_intent_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeBrainstorm: true,
      includeStoryState: true,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: directionPrompt,
      },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

/**
 * Creates a message factory for shape detection.
 * Uses the brainstorm and story state as context; outputs SHAPE: / REASON: on two lines.
 */
export const createShapeDetectionFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const prefix = await buildCruciblePrefix(getState, {
      includeBrainstorm: true,
      includeStoryState: true,
      includeDirection: true,
    });

    const systemPrompt = `You are a story analyst. Given a brainstorm, identify which narrative shape best fits the material.

Shapes:
- CLIMACTIC_CHOICE: builds to an impossible choice between two irreconcilable values
- SPIRAL_DESCENT: deepens without resolving; arrival and origin are the same coordinate
- THRESHOLD_CROSSING: about an irreversible change and what it costs
- EQUILIBRIUM_RESTORED: disruption and return to stability, marked by what the restoration excludes
- ACCUMULATED_WEIGHT: ends when full gravity is felt, not when it breaks
- REVELATION: recontextualises everything by exposing the frame itself

Pick the single best fit. If genuinely ambiguous, prefer CLIMACTIC_CHOICE.

Respond on two lines only:
SHAPE: [shape name]
REASON: [one sentence why]`;

    const messages: Message[] = [
      ...prefix,
      { role: "system", content: systemPrompt },
      { role: "assistant", content: "SHAPE: " },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 64,
        temperature: 0.5,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

/**
 * Creates a message factory for a single shape-native goal generation.
 */
export const createCrucibleGoalFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const shape = state.crucible.detectedShape || "CLIMACTIC_CHOICE";
    const shapeInstruction = SHAPE_INSTRUCTIONS[shape] || SHAPE_INSTRUCTIONS["CLIMACTIC_CHOICE"];
    const shapeExamples = SHAPE_EXAMPLES[shape] || SHAPE_EXAMPLES["CLIMACTIC_CHOICE"];

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
    });

    const messages: Message[] = [...prefix];

    const existingGoals = state.crucible.goals.filter(
      (g) => g.id !== goalId && g.text.trim(),
    );
    if (existingGoals.length > 0) {
      const existingText = existingGoals.map((g) => g.text.trim()).join("\n+++\n");
      messages.push({
        role: "system",
        content: `EXISTING GOALS (do NOT repeat these — approach the core tension from a DIFFERENT angle):\n${existingText}`,
      });
    }

    const goalsPrompt = `Generate ONE goal — a vivid structural endpoint the story arrives at.
Reach for the MAXIMUM POSSIBLE DEPTH of this story's potential.
The goal should represent the furthest, most irrevocable, most
load-bearing moment the brainstorm could possibly arrive at —
not a modest culmination but a TOTAL STRUCTURAL CONCLUSION from
which nothing further is possible.

The shape of this story is: ${shape}

${shapeInstruction}

Generate an endpoint native to that shape at MAXIMUM INTENSITY —
the most total, most irrevocable version of that structural logic.
Do not produce a modest or partial version of the shape.

GOOD ENDPOINTS FOR ${shape}:
${shapeExamples}

BAD ENDPOINTS:
BAD: "Everything changes" — no dramatic moment, nothing to anchor on
BAD: "The hero wins" — outcome without cost
BAD: "She finally chooses to stop" — implies exit; spiral endpoints have no exit
BAD: "He discovers the truth about the spiral" — imports revelation structure onto spiral material
BAD: "It all becomes too much and she breaks down" — catharsis discharges weight; accumulated weight endpoints hold it
BAD: Any endpoint that could be described as partial, modest, or preliminary

Output format:
[GOAL] The endpoint — 1-2 sentences, concrete and vivid
[WHY] Why this framing constrains world-building better than a plot description`;

    messages.push(
      {
        role: "system",
        content: goalsPrompt,
      },
      { role: "assistant", content: "[GOAL] " },
    );

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

// --- Strategy Builders ---

export const buildCrucibleDirectionStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleDirectionFactory(getState),
    target: { type: "crucibleDirection" },
    prefillBehavior: "trim",
  };
};

export const buildShapeDetectionStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createShapeDetectionFactory(getState),
    target: { type: "crucibleShapeDetection" },
    prefillBehavior: "keep",
    assistantPrefill: "SHAPE: ",
  };
};

export const buildCrucibleGoalStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleGoalFactory(getState, goalId),
    target: { type: "crucibleGoal", goalId },
    prefillBehavior: "keep",
    assistantPrefill: "[GOAL] ",
  };
};
