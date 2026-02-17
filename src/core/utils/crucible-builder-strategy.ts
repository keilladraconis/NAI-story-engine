/**
 * Crucible Builder Strategy — Reviews solver beats and emits DULFS nodes.
 *
 * After each solver beat, the builder inspects unprocessed beats and creates
 * or links world elements. Yields [SOLVER] to resume chaining.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
  CrucibleBuilderState,
  CrucibleNodeLink,
  DirectorGuidance,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";
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
 * Compute stable short IDs for builder nodes.
 * Assigns prefix+counter per fieldId in node-order: C0, C1, L0, etc.
 * Returns Map<nodeId, shortId>.
 */
export function computeShortIds(nodes: CrucibleNodeLink[]): Map<string, string> {
  const counters: Record<string, number> = {};
  const result = new Map<string, string>();
  for (const node of nodes) {
    const prefix = FIELD_PREFIX[node.fieldId] || "X";
    const idx = counters[prefix] || 0;
    counters[prefix] = idx + 1;
    result.set(node.id, `${prefix}${idx}`);
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
 * Format builder context: goal + unprocessed beats + existing nodes with short IDs.
 */
function formatBuilderContext(
  chain: CrucibleChain,
  goal: CrucibleGoal,
  builder: CrucibleBuilderState,
  guidance: DirectorGuidance | null,
): string {
  const sections: string[] = [];

  // Goal summary
  const goalText = parseTag(goal.text, "GOAL") || goal.text.slice(0, 100);
  sections.push(`GOAL: ${goalText}`);

  // Unprocessed beats
  const startIndex = builder.lastProcessedBeatIndex + 1;
  const unprocessed = chain.beats.slice(startIndex);
  if (unprocessed.length > 0) {
    sections.push("\nNEW BEATS TO REVIEW:");
    for (let i = 0; i < unprocessed.length; i++) {
      const beat = unprocessed[i];
      const beatNum = startIndex + i + 1;
      const scene = parseTag(beat.text, "SCENE") || beat.text.split("\n")[0];
      sections.push(`  Beat ${beatNum}: ${scene}`);
    }
  }

  // Existing nodes with short IDs and content
  if (builder.nodes.length > 0) {
    const shortIds = computeShortIds(builder.nodes);
    sections.push("\nEXISTING WORLD ELEMENTS (reference with [ID:xx], or re-emit tag + [ID:xx] to revise):");
    for (const node of builder.nodes) {
      const sid = shortIds.get(node.id) || "??";
      const label = FIELD_LABEL[node.fieldId] || node.fieldId;
      const desc = node.content ? `: ${node.content}` : "";
      sections.push(`  [${sid}] ${node.name} (${label})${desc}`);
    }
  }

  // Director guidance — strategic notes from meta-analysis
  if (guidance?.builder) {
    sections.push(`\nDIRECTOR GUIDANCE: ${guidance.builder}`);
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

    const context = formatBuilderContext(chain, goal, state.crucible.builder, state.crucible.directorGuidance);
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
        content: context + "\n\nReview the new beats. Emit world elements, then yield to solver.",
      },
      { role: "assistant", content: "[" },
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
