/**
 * Crucible Chain Strategy — Three-step chain: structural goal → prerequisites → elements.
 * Plus expansion strategy for post-merge element expansion.
 */

import {
  RootState,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";

/** DULFS field display labels for context formatting. */
const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
};

// --- Structural Goal ---

export const createStructuralGoalFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const goal = state.crucible.goals.find((g) => g.id === goalId);
    if (!goal) throw new Error(`[crucible] Goal not found: ${goalId}`);

    const prompt = String(
      (await api.v1.config.get("crucible_structural_goal_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
    });

    // Include the user's goal text as context
    const goalText = parseTag(goal.text, "GOAL") || goal.text;
    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `USER'S DRAMATIC GOAL:\n${goalText}`,
      },
      { role: "assistant", content: "[GOAL] " },
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

export const buildStructuralGoalStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createStructuralGoalFactory(getState, goalId),
    target: { type: "crucibleStructuralGoal", goalId },
    prefillBehavior: "keep",
    assistantPrefill: "[GOAL] ",
  };
};

// --- Prerequisites ---

export const createPrereqsFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const prompt = String(
      (await api.v1.config.get("crucible_prerequisites_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
    });

    // Format structural goals for context
    const goalsContext = state.crucible.structuralGoals
      .map((sg) => `[GOAL] ${sg.text}\n[WHY] ${sg.why}`)
      .join("\n+++\n");

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `STRUCTURAL GOALS:\n${goalsContext}`,
      },
      { role: "assistant", content: "[PREREQ] " },
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

export const buildPrereqsStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createPrereqsFactory(getState),
    target: { type: "cruciblePrereqs" },
    prefillBehavior: "keep",
    assistantPrefill: "[PREREQ] ",
  };
};

// --- World Elements ---

export const createElementsFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const prompt = String(
      (await api.v1.config.get("crucible_elements_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
      includeDulfs: state.crucible.elements.length > 0,
    });

    // Format structural goals
    const goalsContext = state.crucible.structuralGoals
      .map((sg) => `- ${sg.text}`)
      .join("\n");

    // Format prerequisites
    const prereqsContext = state.crucible.prerequisites
      .map((p) => `- [${p.category}] ${p.element} — ${p.loadBearing}`)
      .join("\n");

    // Format existing elements if any
    let existingContext = "";
    if (state.crucible.elements.length > 0) {
      existingContext = "\n\nEXISTING WORLD ELEMENTS:\n" + state.crucible.elements
        .map((e) => `- ${e.name} (${FIELD_LABEL[e.fieldId] || e.fieldId})`)
        .join("\n");
    }

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `STRUCTURAL GOALS:\n${goalsContext}\n\nPREREQUISITES:\n${prereqsContext}${existingContext}`,
      },
      { role: "assistant", content: "+++\n" },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.8,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

export const buildElementsStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createElementsFactory(getState),
    target: { type: "crucibleElements" },
    prefillBehavior: "keep",
    assistantPrefill: "+++\n",
  };
};

// --- Expansion ---

export const createExpansionFactory = (
  getState: () => RootState,
  elementId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const element = state.crucible.elements.find((e) => e.id === elementId);
    if (!element) throw new Error(`[crucible] Element not found: ${elementId}`);

    const prompt = String(
      (await api.v1.config.get("crucible_expansion_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
      includeDulfs: true,
    });

    // Format existing world for context
    const worldContext = state.crucible.elements
      .map((e) => `- ${e.name} (${FIELD_LABEL[e.fieldId] || e.fieldId}): ${e.content.slice(0, 100)}`)
      .join("\n");

    // Format structural goals
    const goalsContext = state.crucible.structuralGoals
      .map((sg) => `- ${sg.text}`)
      .join("\n");

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `EXPANSION SEED:\n${element.name} (${FIELD_LABEL[element.fieldId] || element.fieldId}): ${element.content}\n\nSTRUCTURAL GOALS:\n${goalsContext}\n\nEXISTING WORLD:\n${worldContext}\n\nWhat does "${element.name}" specifically require that is not yet present in this world?`,
      },
      { role: "assistant", content: "[PREREQ] " },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.8,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

export const buildExpansionStrategy = (
  getState: () => RootState,
  elementId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createExpansionFactory(getState, elementId),
    target: { type: "crucibleExpansion", elementId },
    prefillBehavior: "keep",
    assistantPrefill: "[PREREQ] ",
  };
};
