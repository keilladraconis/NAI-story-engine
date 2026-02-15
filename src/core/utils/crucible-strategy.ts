/**
 * Crucible Strategy — Factory functions for Crucible v4 backward-chain world generator.
 *
 * Three strategies: goals extraction, per-goal chain, world element merge.
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
 * Shows goal, beats (newest-first), open/resolved constraints, and accumulated world elements.
 */
function formatChainContext(chain: CrucibleChain, goal: CrucibleGoal): string {
  const sections: string[] = [];

  // Goal statement
  sections.push(`GOAL: ${goal.goal}`);
  sections.push(`TERMINAL CONDITION: ${goal.terminalCondition}`);
  sections.push(`STAKES: ${goal.stakes}`);
  sections.push(`THEME: ${goal.theme}`);

  // Beats (newest-first — closest to goal first)
  if (chain.beats.length > 0) {
    sections.push("\nESTABLISHED BEATS (newest-first, closest to goal first):");
    for (let i = chain.beats.length - 1; i >= 0; i--) {
      const beat = chain.beats[i];
      sections.push(`  Beat ${i + 1}: ${beat.scene}`);
      if (beat.charactersPresent.length > 0) {
        sections.push(`    Characters: ${beat.charactersPresent.join(", ")}`);
      }
      if (beat.location) {
        sections.push(`    Location: ${beat.location}`);
      }
      if (beat.conflictTension) {
        sections.push(`    Conflict: ${beat.conflictTension}`);
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

  // Accumulated world elements
  const we = chain.worldElements;
  const hasElements =
    we.characters.length + we.locations.length + we.factions.length +
    we.systems.length + we.situations.length > 0;
  if (hasElements) {
    sections.push("\nWORLD ELEMENTS DERIVED SO FAR:");
    if (we.characters.length > 0) {
      sections.push(`  Characters: ${we.characters.map((e) => `${e.name} (${e.description})`).join("; ")}`);
    }
    if (we.locations.length > 0) {
      sections.push(`  Locations: ${we.locations.map((e) => `${e.name} (${e.description})`).join("; ")}`);
    }
    if (we.factions.length > 0) {
      sections.push(`  Factions: ${we.factions.map((e) => `${e.name} (${e.description})`).join("; ")}`);
    }
    if (we.systems.length > 0) {
      sections.push(`  Systems: ${we.systems.map((e) => `${e.name} (${e.description})`).join("; ")}`);
    }
    if (we.situations.length > 0) {
      sections.push(`  Situations: ${we.situations.map((e) => `${e.name} (${e.description})`).join("; ")}`);
    }
  }

  return sections.join("\n");
}

/**
 * Format all chains' world elements for the merge prompt.
 */
function formatAllChainsElements(state: RootState): string {
  const sections: string[] = [];

  for (const goal of state.crucible.goals.filter((g) => g.selected)) {
    const chain = state.crucible.chains[goal.id];
    if (!chain) continue;

    sections.push(`\n--- GOAL: ${goal.goal} ---`);

    const we = chain.worldElements;
    const formatList = (label: string, items: { name: string; description: string }[]): void => {
      if (items.length > 0) {
        sections.push(`  ${label}:`);
        for (const item of items) {
          sections.push(`    - ${item.name}: ${item.description}`);
        }
      }
    };

    formatList("Characters", we.characters);
    formatList("Locations", we.locations);
    formatList("Factions", we.factions);
    formatList("Systems", we.systems);
    formatList("Situations", we.situations);
  }

  return sections.join("\n");
}

// --- Factory Functions ---

/**
 * Creates a message factory for Crucible goal extraction.
 * GLM reads brainstorm + story state and derives 3-5 goals with terminal conditions.
 */
export const createCrucibleGoalsFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const goalsPrompt = String(
      (await api.v1.config.get("crucible_goals_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: goalsPrompt,
      },
      { role: "assistant", content: '{"goals":[{"goal":"' },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
      },
    };
  };
};

/**
 * Creates a message factory for backward-chaining beat generation.
 * GLM sees the goal, existing beats, constraints, and world elements, then generates the next beat.
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
      { role: "assistant", content: '{"scene":"' },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
      },
    };
  };
};

/**
 * Creates a message factory for world element merge.
 * GLM sees all chains' world elements and produces a unified inventory.
 */
export const createCrucibleMergeFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();

    const mergePrompt = String(
      (await api.v1.config.get("crucible_merge_prompt")) || "",
    );

    const elementsContext = formatAllChainsElements(state);
    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: mergePrompt,
      },
      {
        role: "user",
        content: `Merge these per-goal world elements into a unified inventory:\n${elementsContext}`,
      },
      { role: "assistant", content: '{"elements":[{"name":"' },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.8,
        min_p: 0.05,
      },
    };
  };
};

// --- Strategy Builders ---

/**
 * Builds a Crucible goals generation strategy.
 * Uses continuation (maxCalls: 3) since 3-5 goals may exceed 1024 tokens.
 */
export const buildCrucibleGoalsStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleGoalsFactory(getState),
    target: { type: "crucibleGoals" },
    prefillBehavior: "keep",
    assistantPrefill: '{"goals":[{"goal":"',
    continuation: { maxCalls: 3 },
  };
};

/**
 * Builds a Crucible chain generation strategy.
 * No continuation — single beat fits in 1024 tokens.
 */
export const buildCrucibleChainStrategy = (
  getState: () => RootState,
  goalId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleChainFactory(getState, goalId),
    target: { type: "crucibleChain", goalId },
    prefillBehavior: "keep",
    assistantPrefill: '{"scene":"',
  };
};

/**
 * Builds a Crucible merge generation strategy.
 * Uses continuation (maxCalls: 5) since merged elements can be extensive.
 */
export const buildCrucibleMergeStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleMergeFactory(getState),
    target: { type: "crucibleMerge" },
    prefillBehavior: "keep",
    assistantPrefill: '{"elements":[{"name":"',
    continuation: { maxCalls: 5 },
  };
};
