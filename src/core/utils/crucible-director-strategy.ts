/**
 * Crucible Director Strategy — Periodic meta-analysis agent.
 *
 * The Director runs at builder→solver transitions when 3+ scenes have
 * accumulated since its last assessment. It sees the full chain state —
 * scenes, constraints, world elements — and produces targeted guidance
 * for both Solver and Builder.
 *
 * Output: ~200-400 tokens. Cost is negligible compared to the scenes themselves.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleChain,
  CrucibleGoal,
  CrucibleWorldElement,
  DirectorGuidance,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { parseTag } from "./tag-parser";
import { computeShortIds } from "./crucible-builder-strategy";
import { sceneNumber, getMaxScenes } from "./crucible-strategy";
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
 * Shows everything: goal, all scenes, all constraints, all world elements,
 * and the previous Director guidance (if any).
 */
function formatDirectorContext(
  goal: CrucibleGoal,
  chain: CrucibleChain,
  elements: CrucibleWorldElement[],
  previousGuidance: DirectorGuidance | null,
  maxScenes: number,
): string {
  const sections: string[] = [];

  // Goal
  const goalText = parseTag(goal.text, "GOAL") || goal.text.split("\n")[0];
  sections.push(`GOAL: ${goalText}`);

  // All scenes (story-chronological for Director — reading the screenplay)
  if (chain.scenes.length > 0) {
    sections.push(`\nSCENES (${chain.scenes.length} total, story order — Scene ${sceneNumber(chain.scenes.length - 1)} → Scene ${sceneNumber(0)}):`);
    for (let i = chain.scenes.length - 1; i >= 0; i--) {
      const scene = parseTag(chain.scenes[i].text, "SCENE") || chain.scenes[i].text.split("\n")[0];
      const markers: string[] = [];
      if (chain.scenes[i].favorited) markers.push("★");
      if (chain.scenes[i].tainted) markers.push("⚠ TAINTED");
      const suffix = markers.length > 0 ? ` (${markers.join(", ")})` : "";
      sections.push(`  Scene ${sceneNumber(i)}: ${scene}${suffix}`);
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
      const label = c.status === "groundState" ? "ground state" : `Scene ${sceneNumber(c.sourceSceneIndex)}`;
      sections.push(`  [${c.shortId}] ${c.description} → ${label}`);
    }
  }

  // Temporal position — tells Director where in the arc the Solver is working
  const sceneCount = chain.scenes.length;
  const remaining = maxScenes - sceneCount;
  if (sceneCount === 0) {
    sections.push("\nTEMPORAL POSITION: Solver has not started yet — next scene is the CLIMAX (Scene 1).");
  } else if (remaining <= 1) {
    sections.push(`\nTEMPORAL POSITION: Scene ${sceneNumber(sceneCount)} of ${maxScenes} — Solver is at the ORIGIN, the very beginning of the story. Guidance must fit foundational, pre-story circumstances.`);
  } else if (remaining <= 2) {
    sections.push(`\nTEMPORAL POSITION: Scene ${sceneNumber(sceneCount)} of ${maxScenes} — Solver is near the ORIGIN. Guidance should target early life, formative events, foundational world state.`);
  } else if (sceneCount <= 2) {
    sections.push(`\nTEMPORAL POSITION: Scene ${sceneNumber(sceneCount)} of ${maxScenes} — Solver is near the CLIMAX. Guidance should target mid-to-late story elements, escalating tensions.`);
  } else {
    const progress = sceneCount / maxScenes;
    const era = progress < 0.4 ? "mid-story" : progress < 0.7 ? "early-mid story" : "early story";
    sections.push(`\nTEMPORAL POSITION: Scene ${sceneNumber(sceneCount)} of ${maxScenes} — Solver is exploring the ${era}. Guidance must be temporally appropriate to this era.`);
  }

  // World elements
  if (elements.length > 0) {
    const shortIds = computeShortIds(elements);
    sections.push(`\nWORLD ELEMENTS (${elements.length}):`);
    for (const el of elements) {
      const sid = shortIds.get(el.id) || "??";
      const label = FIELD_LABEL[el.fieldId] || el.fieldId;
      const desc = el.content ? ` — ${el.content}` : "";
      sections.push(`  [${sid}] ${el.name} (${label})${desc}`);
    }
  } else {
    sections.push("\nWORLD ELEMENTS: none yet");
  }

  // Previous guidance (for continuity)
  if (previousGuidance) {
    sections.push(`\nYOUR PREVIOUS GUIDANCE (at Scene ${sceneNumber(previousGuidance.atSceneIndex)}):`);
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

    const maxScenes = await getMaxScenes();
    const context = formatDirectorContext(
      goal,
      chain,
      state.crucible.builder.elements,
      state.crucible.directorGuidance,
      maxScenes,
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
        max_tokens: 700,
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
