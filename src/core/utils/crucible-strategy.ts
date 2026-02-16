/**
 * Crucible Strategy — Factory functions for Crucible v5 lean solver.
 *
 * Three strategies: intent derivation, goals extraction, per-goal chain.
 * All use tagged plaintext output format for streaming-first design.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";

// --- Chain Context Formatter ---

/**
 * Format chain context for the backward-chaining prompt.
 * Shows goal text, beats (newest-first), and open/resolved constraints with short IDs.
 */
/**
 * Format pacing signal based on beat count and open constraints.
 * Guides the solver toward convergence as the chain grows.
 */
function formatPacingSignal(beatCount: number, openCount: number): string {
  if (beatCount === 0)
    return "\nPACING: FIRST BEAT — this IS the penultimate scene. Open NEW preconditions only (not already listed above). Do NOT resolve anything.";
  if (beatCount <= 3)
    return `\nPACING: EARLY — open NEW preconditions. Resolve at most 1. ${openCount} open.`;
  if (beatCount <= 6)
    return `\nPACING: CONVERGE — resolve ≤2, open ≤1 NEW. ${openCount} remain.`;
  if (beatCount <= 8)
    return `\nPACING: CLOSE OUT — resolve all remaining. No new constraints. ${openCount} remain.`;
  return `\nPACING: OVERDUE — final beat. Close all ${openCount} constraints NOW.`;
}

function formatChainContext(chain: CrucibleChain, goal: CrucibleGoal): string {
  const sections: string[] = [];

  // Goal — show [GOAL] text only, strip [OPEN] to avoid duplication
  // (seed constraints are tracked in OPEN CONSTRAINTS below)
  const goalText = parseTag(goal.text, "GOAL") || goal.text.split("\n")[0];
  sections.push(goal.selected ? "ACTIVE GOAL (★ starred):" : "ACTIVE GOAL:");
  sections.push(goalText);

  // Beats (newest-first — SCENE only)
  // Constraint state lives in the dedicated OPEN/RESOLVED sections below.
  // Showing constraint tags inside beats causes GLM to confuse ID formats.
  if (chain.beats.length > 0) {
    sections.push("\nESTABLISHED BEATS (newest-first, closest to goal first):");
    for (let i = chain.beats.length - 1; i >= 0; i--) {
      const scene = parseTag(chain.beats[i].text, "SCENE") || chain.beats[i].text.split("\n")[0];
      sections.push(`  Beat ${i + 1}: ${scene}`);
    }
  }

  // Open constraints with stable short IDs
  if (chain.openConstraints.length > 0) {
    sections.push("\nOPEN CONSTRAINTS (already tracked — do NOT re-emit these in [OPEN]):");
    for (const c of chain.openConstraints) {
      const source = c.sourceBeatIndex === 0 && chain.beats.length === 0 ? "seed" : `Beat ${c.sourceBeatIndex + 1}`;
      sections.push(`  [${c.shortId}] ${c.description} (${source})`);
    }
  }

  // Resolved constraints
  if (chain.resolvedConstraints.length > 0) {
    sections.push("\nRESOLVED CONSTRAINTS:");
    for (const c of chain.resolvedConstraints) {
      const label = c.status === "groundState" ? "ground state" : `Beat ${c.sourceBeatIndex + 1}`;
      sections.push(`  - ${c.description} → ${label}`);
    }
  }

  // Pacing signal — dynamic convergence pressure
  const pacing = formatPacingSignal(chain.beats.length, chain.openConstraints.length);
  if (pacing) sections.push(pacing);

  return sections.join("\n");
}

// --- Factory Functions ---

/**
 * Creates a message factory for Crucible intent derivation.
 */
export const createCrucibleIntentFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const intentPrompt = String(
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
        content: intentPrompt,
      },
      { role: "assistant", content: "The story " },
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
 * Creates a message factory for backward-chaining beat generation.
 * Lean beats: no world elements block — just scene, conflict, location, constraints.
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

    const context = formatChainContext(chain, goal);
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
        content: context + "\n\nDesign the next beat backward.",
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

export const buildCrucibleIntentStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleIntentFactory(getState),
    target: { type: "crucibleIntent" },
    prefillBehavior: "keep",
    assistantPrefill: "The story ",
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
