/**
 * Crucible Director Strategy — Periodic meta-analysis agent.
 *
 * The Director runs at builder→solver transitions when 3+ beats have
 * accumulated since its last assessment. It sees the full chain state —
 * beats, constraints, builder nodes — and produces targeted guidance
 * for both Solver and Builder.
 *
 * Output: ~200-400 tokens. Cost is negligible compared to the beats themselves.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
  CrucibleNodeLink,
  DirectorGuidance,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";
import { computeShortIds } from "./crucible-builder-strategy";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";

/** DULFS field label for Director context. */
const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
};

/**
 * Format a comprehensive snapshot for the Director.
 * Shows everything: goal, all beats, all constraints, all builder nodes,
 * and the previous Director guidance (if any).
 */
function formatDirectorContext(
  goal: CrucibleGoal,
  chain: CrucibleChain,
  nodes: CrucibleNodeLink[],
  previousGuidance: DirectorGuidance | null,
): string {
  const sections: string[] = [];

  // Goal
  const goalText = parseTag(goal.text, "GOAL") || goal.text.split("\n")[0];
  sections.push(`GOAL: ${goalText}`);

  // All beats (chronological for Director — unlike Solver which sees newest-first)
  if (chain.beats.length > 0) {
    sections.push(`\nBEATS (${chain.beats.length} total, newest = closest to goal):`);
    for (let i = 0; i < chain.beats.length; i++) {
      const scene = parseTag(chain.beats[i].text, "SCENE") || chain.beats[i].text.split("\n")[0];
      const markers: string[] = [];
      if (chain.beats[i].favorited) markers.push("★");
      if (chain.beats[i].tainted) markers.push("edited");
      const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
      sections.push(`  Beat ${i + 1}: ${scene}${suffix}`);
    }
  }

  // Constraint snapshot
  const open = chain.openConstraints;
  const resolved = chain.resolvedConstraints;
  sections.push(`\nCONSTRAINT STATUS: ${open.length} open, ${resolved.length} resolved`);

  if (open.length > 0) {
    sections.push("OPEN:");
    for (const c of open) {
      sections.push(`  [${c.shortId}] ${c.description}`);
    }
  }

  if (resolved.length > 0) {
    sections.push("RESOLVED:");
    for (const c of resolved) {
      const label = c.status === "groundState" ? "ground state" : `Beat ${c.sourceBeatIndex + 1}`;
      sections.push(`  [${c.shortId}] ${c.description} → ${label}`);
    }
  }

  // Builder nodes
  if (nodes.length > 0) {
    const shortIds = computeShortIds(nodes);
    sections.push(`\nWORLD ELEMENTS (${nodes.length}):`);
    for (const node of nodes) {
      const sid = shortIds.get(node.id) || "??";
      const label = FIELD_LABEL[node.fieldId] || node.fieldId;
      const desc = node.content ? ` — ${node.content}` : "";
      sections.push(`  [${sid}] ${node.name} (${label})${desc}`);
    }
  } else {
    sections.push("\nWORLD ELEMENTS: none yet");
  }

  // Previous guidance (for continuity)
  if (previousGuidance) {
    sections.push(`\nYOUR PREVIOUS GUIDANCE (at beat ${previousGuidance.atBeatIndex}):`);
    sections.push(`  Solver: ${previousGuidance.solver}`);
    sections.push(`  Builder: ${previousGuidance.builder}`);
  }

  return sections.join("\n");
}

/**
 * Creates a message factory for the Director assessment.
 */
export const createCrucibleDirectorFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const { activeGoalId } = state.crucible;
    const chain = activeGoalId ? state.crucible.chains[activeGoalId] : null;
    const goal = state.crucible.goals.find((g) => g.id === activeGoalId);

    if (!chain || !goal) {
      throw new Error("[crucible-director] No active chain/goal");
    }

    const directorPrompt = String(
      (await api.v1.config.get("crucible_director_prompt")) || "",
    );

    const context = formatDirectorContext(
      goal,
      chain,
      state.crucible.builder.nodes,
      state.crucible.directorGuidance,
    );

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: directorPrompt,
      },
      {
        role: "user",
        content: context + "\n\nAssess the current state and provide guidance.",
      },
      { role: "assistant", content: "[ASSESSMENT] " },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 512,
        temperature: 0.8,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

/**
 * Builds a Director generation strategy.
 */
export const buildCrucibleDirectorStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleDirectorFactory(getState),
    target: { type: "crucibleDirector" },
    prefillBehavior: "keep",
    assistantPrefill: "[ASSESSMENT] ",
  };
};
