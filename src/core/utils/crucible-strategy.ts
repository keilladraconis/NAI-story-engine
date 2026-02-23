/**
 * Crucible Strategy — Factory functions for direction derivation and goals extraction.
 *
 * The three-step chain strategies (structural goal, prerequisites, elements)
 * are in crucible-chain-strategy.ts.
 */

import {
  RootState,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";

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
