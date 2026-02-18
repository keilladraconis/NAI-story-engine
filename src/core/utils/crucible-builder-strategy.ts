/**
 * Crucible Builder Strategy — Reviews solver scenes and emits world elements.
 *
 * After each solver scene, the builder inspects unprocessed scenes and creates
 * or updates world elements. Yields [SOLVER] to resume chaining.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
  CrucibleBuilderState,
  CrucibleWorldElement,
  DirectorGuidance,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";
import { sceneNumber, getMaxScenes } from "./crucible-strategy";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";

/** Short-ID prefix per DULFS field. */
const FIELD_PREFIX: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "C",
  [FieldID.UniverseSystems]: "U",
  [FieldID.Locations]: "L",
  [FieldID.Factions]: "F",
  [FieldID.SituationalDynamics]: "S",
};

/**
 * Compute stable short IDs for world elements.
 * Assigns prefix+counter per fieldId in element-order: C0, C1, L0, etc.
 * Returns Map<elementId, shortId>.
 */
export function computeShortIds(elements: CrucibleWorldElement[]): Map<string, string> {
  const counters: Record<string, number> = {};
  const result = new Map<string, string>();
  for (const el of elements) {
    const prefix = FIELD_PREFIX[el.fieldId] || "X";
    const idx = counters[prefix] || 0;
    counters[prefix] = idx + 1;
    result.set(el.id, `${prefix}${idx}`);
  }
  return result;
}

/** Display label for a DULFS fieldId. */
const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
};

/**
 * Format builder context: goal + unprocessed scenes + existing elements with short IDs.
 */
function formatBuilderContext(
  chain: CrucibleChain,
  goal: CrucibleGoal,
  builder: CrucibleBuilderState,
  guidance: DirectorGuidance | null,
  maxScenes: number,
): string {
  const sections: string[] = [];

  // Goal summary
  const goalText = parseTag(goal.text, "GOAL") || goal.text.slice(0, 100);
  sections.push(`GOAL: ${goalText}`);

  // Unprocessed scenes
  const startIndex = builder.lastProcessedSceneIndex + 1;
  const unprocessed = chain.scenes.slice(startIndex);
  if (unprocessed.length > 0) {
    sections.push("\nNEW SCENES TO REVIEW:");
    for (let i = 0; i < unprocessed.length; i++) {
      const sceneData = unprocessed[i];
      const scene = parseTag(sceneData.text, "SCENE") || sceneData.text.split("\n")[0];
      sections.push(`  Scene ${sceneNumber(startIndex + i, maxScenes)}: ${scene}`);
    }
  }

  // Existing elements with short IDs and content
  if (builder.elements.length > 0) {
    const shortIds = computeShortIds(builder.elements);
    sections.push("\nEXISTING WORLD ELEMENTS (reference with [ID:xx], or re-emit tag + [ID:xx] to revise):");
    for (const el of builder.elements) {
      const sid = shortIds.get(el.id) || "??";
      const label = FIELD_LABEL[el.fieldId] || el.fieldId;
      // Don't include description, to prevent anchoring on later formation of element.
      sections.push(`  [${sid}] ${el.name} - ${label}`);
    }
  }

  // Director guidance — strategic notes from meta-analysis
  if (guidance?.builder) {
    sections.push(`\nDIRECTOR GUIDANCE (act on this NOW — it will not repeat): ${guidance.builder}`);
  }

  return sections.join("\n");
}

/**
 * Creates a message factory for Crucible builder.
 */
export const createCrucibleBuildFactory = (
  getState: () => RootState,
  goalId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const chain = state.crucible.chains[goalId];
    const goal = state.crucible.goals.find((g) => g.id === goalId);

    if (!chain || !goal) {
      throw new Error(`[crucible-builder] Chain or goal not found for ${goalId}`);
    }

    const buildPrompt = String(
      (await api.v1.config.get("crucible_build_prompt")) || "",
    );

    const maxScenes = await getMaxScenes();
    const context = formatBuilderContext(chain, goal, state.crucible.builder, state.crucible.directorGuidance, maxScenes);
    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeDulfs: true,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: buildPrompt,
      },
      {
        role: "user",
        content: context + "\n\nReview the new scenes. Emit world elements, then yield to solver.",
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

/**
 * Builds a Crucible builder strategy.
 * Continuation allowed for multi-element emission.
 */
export const buildCrucibleBuildStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleBuildFactory(getState, goalId),
    target: { type: "crucibleBuild", goalId },
    prefillBehavior: "keep",
    assistantPrefill: "[",
    continuation: { maxCalls: 3 },
  };
};
