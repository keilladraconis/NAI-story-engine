/**
 * Crucible Strategy — Factory functions for direction derivation, shape generation, and goals extraction.
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

// --- Factory Functions ---

/**
 * Creates a message factory for generative shape production.
 * Reads brainstorm + story state and invents the shape that fits.
 * If prefillName is provided, it is injected as the assistant prefill so GLM
 * only needs to generate the instruction, not the shape name.
 */
export const createCrucibleShapeFactory = (
  getState: () => RootState,
  prefillName?: string,
): MessageFactory => {
  return async () => {
    const shapePrompt = String(
      (await api.v1.config.get("crucible_shape_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeBrainstorm: true,
      includeStoryState: true,
    });

    const prefill = prefillName ? `SHAPE: ${prefillName}\n\n` : "SHAPE: ";

    const messages: Message[] = [
      ...prefix,
      { role: "system", content: shapePrompt },
      { role: "assistant", content: prefill },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 128,
        temperature: 0.7,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

/**
 * Creates a message factory for Crucible direction derivation.
 * Reads the generated shape (if available) to produce shape-aware direction prose.
 */
export const createCrucibleDirectionFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const directionPrompt = String(
      (await api.v1.config.get("crucible_intent_prompt")) || "",
    );

    const state = getState();
    const shape = state.crucible.shape;

    const prefix = await buildCruciblePrefix(getState, {
      includeBrainstorm: true,
      includeStoryState: true,
    });

    const messages: Message[] = [...prefix];

    if (shape) {
      messages.push({
        role: "system",
        content: `This story has the structure of ${shape.name}: ${shape.instruction}`,
      });
    }

    messages.push({
      role: "system",
      content: directionPrompt,
    });

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
 * Creates a message factory for a single shape-native goal generation.
 * Reads shape.instruction directly from state and injects it as context before the config prompt.
 */
export const createCrucibleGoalFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const shape = state.crucible.shape;
    const goalsPrompt = String(
      (await api.v1.config.get("crucible_goals_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
    });

    const messages: Message[] = [...prefix];

    // Consolidate task context into a single user turn to avoid stacked system messages
    // confusing GLM's chat template and producing <|system|> delimiters in output.
    const userParts: string[] = [];

    if (shape) {
      userParts.push(`SHAPE: ${shape.name}\n${shape.instruction}`);
    }

    const existingGoals = state.crucible.goals.filter(
      (g) => g.id !== goalId && g.text.trim(),
    );
  if (existingGoals.length > 0) {
      const existingText = existingGoals.map((g) => g.text.trim()).join("\n+++\n");
      userParts.push(`EXISTING GOALS (do NOT repeat these — approach the core tension from a DIFFERENT angle):\n${existingText}`);
    }

    userParts.push(goalsPrompt);

    messages.push(
      { role: "user", content: userParts.join("\n\n") },
      { role: "assistant", content: "[GOAL] " },
    );

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 300,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>", "\n#", "\n---", "<|system|>"],
      },
    };
  };
};

// --- Strategy Builders ---

export const buildCrucibleShapeStrategy = (
  getState: () => RootState,
  prefillName?: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleShapeFactory(getState, prefillName),
    target: { type: "crucibleShape", prefillName },
    prefillBehavior: "trim",
    assistantPrefill: prefillName ? `SHAPE: ${prefillName}\n\n` : "SHAPE: ",
  };
};

export const buildCrucibleDirectionStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleDirectionFactory(getState),
    target: { type: "crucibleDirection" },
    prefillBehavior: "trim",
    continuation: { maxCalls: 2 },
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
