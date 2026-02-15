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
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";

/**
 * Format builder context: goal + unprocessed beats + existing nodes for dedup.
 */
function formatBuilderContext(
  chain: CrucibleChain,
  goal: CrucibleGoal,
  builder: CrucibleBuilderState,
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
      const conflict = parseTag(beat.text, "CONFLICT") || "";
      const location = parseTag(beat.text, "LOCATION") || "";
      sections.push(`  Beat ${beatNum}: ${scene}`);
      if (conflict) sections.push(`    Conflict: ${conflict}`);
      if (location) sections.push(`    Location: ${location}`);
    }
  }

  // Existing nodes for dedup
  if (builder.nodes.length > 0) {
    sections.push("\nEXISTING WORLD ELEMENTS (do NOT duplicate — use [LINK] to reference):");
    for (const node of builder.nodes) {
      sections.push(`  - ${node.name} (${node.fieldId}) [beats: ${node.beatIndices.join(",")}]`);
    }
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

    const context = formatBuilderContext(chain, goal, state.crucible.builder);
    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: buildPrompt,
      },
      {
        role: "user",
        content: context + "\n\nReview the new beats. Emit world elements or link existing ones, then yield to solver.",
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
