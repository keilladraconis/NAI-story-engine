/**
 * Crucible Strategy — Factory functions for shape generation, direction derivation,
 * and tension extraction.
 *
 * The build loop strategy is in crucible-build-strategy.ts.
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

    messages.push({ role: "assistant", content: "The story " });

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
 * Creates a message factory for tension generation.
 * Generates 3-5 narrative tensions in a single call.
 */
export const createCrucibleTensionFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const tensionPrompt = String(
      (await api.v1.config.get("crucible_tensions_prompt")) || "",
    );

    const state = getState();
    const shape = state.crucible.shape;

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
    });

    const messages: Message[] = [...prefix];

    // Consolidate task context into a single user turn
    const userParts: string[] = [];

    if (shape) {
      userParts.push(`SHAPE: ${shape.name}\n${shape.instruction}`);
    }

    // Show existing tensions for dedup
    const existingTensions = state.crucible.tensions.filter((t) => t.text.trim());
    if (existingTensions.length > 0) {
      const existingText = existingTensions.map((t) => `- ${t.text.trim()}`).join("\n");
      userParts.push(`EXISTING TENSIONS (do NOT repeat these):\n${existingText}`);
    }

    userParts.push(tensionPrompt);

    messages.push(
      { role: "user", content: userParts.join("\n\n") },
      { role: "assistant", content: "[TENSION] " },
    );

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>", "\n#", "<|system|>"],
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
    assistantPrefill: "The story ",
    prefillBehavior: "keep",
    continuation: { maxCalls: 2 },
  };
};

export const buildCrucibleTensionStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleTensionFactory(getState),
    target: { type: "crucibleTension" },
    prefillBehavior: "keep",
    assistantPrefill: "[TENSION] ",
    continuation: { maxCalls: 2 },
  };
};
