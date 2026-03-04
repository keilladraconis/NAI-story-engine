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

/** World Entry field display labels for context formatting. */
const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
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

    // Format accepted goals for context
    const starredGoals = state.crucible.goals.filter((g) => g.accepted);
    const goalsContext = starredGoals
      .map((g) => {
        const goalText = parseTag(g.text, "GOAL") || g.text;
        return g.why ? `[GOAL] ${goalText}\n[WHY] ${g.why}` : `[GOAL] ${goalText}`;
      })
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
    continuation: { maxCalls: 3 },
  };
};

// --- Per-Goal World Elements ---

export const createGoalElementsFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const prompt = String(
      (await api.v1.config.get("crucible_goal_elements_prompt")) || "",
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
      includeDulfs: state.crucible.elements.length > 0,
    });

    // Format the target goal
    const goal = state.crucible.goals.find((g) => g.id === goalId);
    const goalText = goal ? (parseTag(goal.text, "GOAL") || goal.text) : "";
    const goalContext = goal?.why
      ? `[GOAL] ${goalText}\n[WHY] ${goal.why}`
      : `[GOAL] ${goalText}`;

    // Format prerequisites (shared foundation)
    const prereqsContext = state.crucible.prerequisites
      .map((p) => `- [${p.category}] ${p.element} — ${p.loadBearing}`)
      .join("\n");

    // Format existing elements if any (JIT: accumulates across sequential calls)
    // Include description so GLM understands what each element covers
    let existingContext = "";
    if (state.crucible.elements.length > 0) {
      existingContext = "\n\nEXISTING WORLD ELEMENTS (do NOT create any element with the same name or role):\n" + state.crucible.elements
        .map((e) => {
          const desc = e.content ? `: ${e.content.slice(0, 120)}` : "";
          return `- ${e.name} (${FIELD_LABEL[e.fieldId] || e.fieldId})${desc}`;
        })
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
        content: `TARGET GOAL:\n${goalContext}\n\nSHARED PREREQUISITES:\n${prereqsContext}${existingContext}`,
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

export const buildGoalElementsStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createGoalElementsFactory(getState, goalId),
    target: { type: "crucibleElements" },
    prefillBehavior: "keep",
    assistantPrefill: "+++\n",
    continuation: { maxCalls: 3 },
  };
};

// --- Expansion ---

export const createExpansionFactory = (
  getState: () => RootState,
  elementId?: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const prompt = String(
      (await api.v1.config.get("crucible_expansion_prompt")) || "",
    );

    // Optional free-form direction from the expansion prompt input
    const freePrompt = String((await api.v1.storyStorage.get("cr-expand-prompt")) || "").trim();

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
      includeDulfs: true,
    });

    // Format existing world for context
    const worldContext = state.crucible.elements
      .map((e) => `- ${e.name} (${FIELD_LABEL[e.fieldId] || e.fieldId}): ${e.content.slice(0, 100)}`)
      .join("\n");

    // Format accepted goals
    const goalsContext = state.crucible.goals
      .filter((g) => g.accepted)
      .map((g) => `- ${parseTag(g.text, "GOAL") || g.text}`)
      .join("\n");

    // Build the expansion question
    let expansionQuestion: string;
    if (elementId) {
      const element = state.crucible.elements.find((e) => e.id === elementId);
      const seedLabel = element
        ? `${element.name} (${FIELD_LABEL[element.fieldId] || element.fieldId}): ${element.content}`
        : elementId;
      expansionQuestion = `EXPANSION SEED:\n${seedLabel}\n\nWhat does this element specifically require that is not yet present in this world?`;
      if (freePrompt) expansionQuestion += `\n\nADDITIONAL DIRECTION:\n${freePrompt}`;
    } else {
      expansionQuestion = freePrompt
        ? `EXPANSION DIRECTION:\n${freePrompt}\n\nWhat must exist in this world to support this?`
        : "What is most conspicuously absent from this world given the structural goals?";
    }

    const messages: Message[] = [
      ...prefix,
      { role: "system", content: prompt },
      {
        role: "user",
        content: `STRUCTURAL GOALS:\n${goalsContext}\n\nEXISTING WORLD:\n${worldContext}\n\n${expansionQuestion}`,
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
  elementId?: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createExpansionFactory(getState, elementId),
    target: { type: "crucibleExpansion", elementId },
    prefillBehavior: "keep",
    assistantPrefill: "[PREREQ] ",
    continuation: { maxCalls: 3 },
  };
};
