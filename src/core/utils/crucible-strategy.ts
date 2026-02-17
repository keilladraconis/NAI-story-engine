/**
 * Crucible Strategy — Factory functions for Crucible lean solver.
 *
 * Three strategies: direction derivation, goals extraction, per-goal chain.
 * All use tagged plaintext output format for streaming-first design.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
  DirectorGuidance,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";

// --- Scene Budget ---

/** Read scene budget from storyStorage slider. Falls back to 5. */
export async function getMaxScenes(): Promise<number> {
  const value = await api.v1.storyStorage.get("cr-scene-budget");
  return Number(value) || 5;
}

// --- Scene Numbering ---

/** Convert a zero-based scene index to an ascending scene number. */
export function sceneNumber(sceneIndex: number): number {
  return sceneIndex + 1;
}

// --- Chain Context Formatter ---

/**
 * Format pacing signal based on scene count, open constraints, and budget.
 * Includes remaining-scene urgency when budget is tight.
 */
function formatPacingSignal(sceneCount: number, openCount: number, maxScenes: number): string {
  if (openCount === 0 && sceneCount > 0)
    return "\nPACING: ALL CONSTRAINTS RESOLVED — write the OPENER that launches this story. If you cannot write a satisfying opener from the current scenes, open new constraints to fill gaps.";
  if (sceneCount === 0)
    return "\nPACING: FIRST SCENE — this is the climax. Open 1-2 preconditions that are DRAMATICALLY far from this moment — foundational circumstances, not adjacent causes.";
  const remaining = maxScenes - sceneCount;
  const nextNum = sceneNumber(sceneCount);
  if (remaining <= 1)
    return `\nPACING: FINAL SCENE (Scene ${nextNum}) — resolve remaining constraints or write the opener.`;
  if (remaining <= 2)
    return `\nPACING: Scene ${nextNum} of ${maxScenes}. 2 scenes remaining — focus on resolving constraints. ${openCount} open.`;
  return `\nPACING: Scene ${nextNum} of ${maxScenes}. You are spanning from climax to origin — each scene should cover roughly equal narrative distance. ${openCount} open constraints.`;
}

function formatChainContext(chain: CrucibleChain, goal: CrucibleGoal, guidance: DirectorGuidance | null, maxScenes: number): string {
  const sections: string[] = [];

  // Goal — show [GOAL] text only, strip [OPEN] to avoid duplication
  // (seed constraints are tracked in OPEN CONSTRAINTS below)
  const goalText = parseTag(goal.text, "GOAL") || goal.text.split("\n")[0];
  sections.push(goal.starred ? "ACTIVE GOAL (★ starred):" : "ACTIVE GOAL:");
  sections.push(goalText);

  // Scenes (ascending order — Scene 1 = first explored, closest to climax)
  // Constraint state lives in the dedicated OPEN/RESOLVED sections below.
  // Showing constraint tags inside scenes causes GLM to confuse ID formats.
  if (chain.scenes.length > 0) {
    sections.push("\nESTABLISHED SCENES:");
    for (let i = 0; i < chain.scenes.length; i++) {
      const scene = parseTag(chain.scenes[i].text, "SCENE") || chain.scenes[i].text.split("\n")[0];
      const taintedMark = chain.scenes[i].tainted ? " ⚠ TAINTED — needs correction" : "";
      sections.push(`  Scene ${sceneNumber(i)}: ${scene}${taintedMark}`);
    }
  }

  // Open constraints with stable short IDs
  if (chain.openConstraints.length > 0) {
    sections.push("\nOPEN CONSTRAINTS (already tracked — do NOT re-emit these in [OPEN]):");
    for (const c of chain.openConstraints) {
      const source = c.sourceSceneIndex === 0 && chain.scenes.length === 0 ? "seed" : `Scene ${sceneNumber(c.sourceSceneIndex)}`;
      sections.push(`  [${c.shortId}] ${c.description} (${source})`);
    }
  }

  // Resolved constraints
  if (chain.resolvedConstraints.length > 0) {
    sections.push("\nRESOLVED CONSTRAINTS:");
    for (const c of chain.resolvedConstraints) {
      const label = c.status === "groundState" ? "ground state" : `Scene ${sceneNumber(c.sourceSceneIndex)}`;
      sections.push(`  - ${c.description} → ${label}`);
    }
  }

  // Pacing signal — dynamic convergence pressure
  const pacing = formatPacingSignal(chain.scenes.length, chain.openConstraints.length, maxScenes);
  if (pacing) sections.push(pacing);

  // Director guidance — strategic notes from meta-analysis
  if (guidance?.solver) {
    sections.push(`\nDIRECTOR GUIDANCE (act on this NOW — it will not repeat): ${guidance.solver}`);
  }

  return sections.join("\n");
}

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
 * Creates a message factory for a single Crucible goal generation.
 */
export const createCrucibleGoalFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const goalsPrompt = String(
      (await api.v1.config.get("crucible_goals_prompt")) || "",
    );

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

/**
 * Creates a message factory for backward-chaining scene generation.
 * Lean scenes: scene text + constraints.
 */
export const createCrucibleChainFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const chain = state.crucible.chains[goalId];
    const goal = state.crucible.goals.find((g) => g.id === goalId);

    if (!chain || !goal) {
      throw new Error(`[crucible] Chain or goal not found for ${goalId}`);
    }

    const chainPrompt = String(
      (await api.v1.config.get("crucible_chain_prompt")) || "",
    );

    const maxScenes = await getMaxScenes();
    const context = formatChainContext(chain, goal, state.crucible.directorGuidance, maxScenes);
    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeDulfs: true,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: chainPrompt,
      },
      {
        role: "user",
        content: context + `\n\nWrite Scene ${sceneNumber(chain.scenes.length)}.`,
      },
      { role: "assistant", content: "[SCENE] " },
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

export const buildCrucibleChainStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleChainFactory(getState, goalId),
    target: { type: "crucibleChain", goalId },
    prefillBehavior: "keep",
    assistantPrefill: "[SCENE] ",
  };
};
