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
import { buildStoryEnginePrefix } from "./context-builder";

// --- Chain Context Formatter ---

/**
 * Format chain context for the backward-chaining prompt.
 * Shows goal text, beats (newest-first), and open/resolved constraints.
 */
function formatChainContext(chain: CrucibleChain, goal: CrucibleGoal): string {
  const sections: string[] = [];

  // Goal — include full tagged text, mark if favorited
  sections.push(goal.selected ? "ACTIVE GOAL (★ FAVORITED — prioritize this goal's themes):" : "ACTIVE GOAL:");
  sections.push(goal.text);

  // Beats (newest-first — closest to goal first)
  if (chain.beats.length > 0) {
    sections.push("\nESTABLISHED BEATS (newest-first, closest to goal first):");
    for (let i = chain.beats.length - 1; i >= 0; i--) {
      const beat = chain.beats[i];
      sections.push(`  Beat ${i + 1}:`);
      for (const line of beat.text.split("\n")) {
        sections.push(`    ${line}`);
      }
    }
  }

  // Open constraints
  if (chain.openConstraints.length > 0) {
    sections.push("\nOPEN CONSTRAINTS (must still be established):");
    for (const c of chain.openConstraints) {
      sections.push(`  - ${c.description} (from Beat ${c.sourceBeatIndex + 1})`);
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

    const prefix = await buildStoryEnginePrefix(getState);

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

    const prefix = state.crucible.intent
      ? await buildStoryEnginePrefix(getState, { excludeSections: ["brainstorm"] })
      : await buildStoryEnginePrefix(getState);

    const messages: Message[] = [...prefix];

    if (state.crucible.intent) {
      messages.push({
        role: "system",
        content: `DERIVED INTENT (user-reviewed):\n${state.crucible.intent}`,
      });
    }

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
    const prefix = await buildStoryEnginePrefix(getState);

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
