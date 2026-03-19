/**
 * Forge Strategy — Intent-driven world element generation.
 *
 * Reads Narrative Foundation (shape, intent, worldState, tensions, attg, style)
 * and all Live entities for world awareness, then produces a GenerationStrategy
 * that emits CREATE/LINK/REVISE/DELETE/DONE commands via the command vocabulary
 * from crucible-command-parser.ts.
 */

import { RootState, GenerationStrategy } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { FieldID, FIELD_CONFIGS, DulfsFieldID } from "../../config/field-definitions";

/** Map World Entry field IDs to display labels (plural). */
const FIELD_LABEL_PLURAL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
  [FieldID.Topics]: "Topics",
};

/**
 * Formats live world entities as context for the forge prompt.
 * Groups by category and lists name + summary for each entity.
 */
function formatLiveWorldContext(state: RootState): string {
  const liveEntities = state.world.entities.filter((e) => e.lifecycle === "live");
  if (liveEntities.length === 0) return "";

  const groups = new Map<DulfsFieldID, typeof liveEntities>();
  for (const entity of liveEntities) {
    const list = groups.get(entity.categoryId) || [];
    list.push(entity);
    groups.set(entity.categoryId, list);
  }

  const lines: string[] = ["[EXISTING WORLD]"];
  for (const fieldId of WORLD_ENTRY_CATEGORIES) {
    const fieldEntities = groups.get(fieldId);
    if (!fieldEntities) continue;
    const label = FIELD_LABEL_PLURAL[fieldId] || fieldId;
    lines.push(`${label}:`);
    for (const entity of fieldEntities) {
      const desc = entity.summary ? `: ${entity.summary.slice(0, 100)}` : "";
      lines.push(`- ${entity.name}${desc}`);
    }
  }

  // Relationships
  if (state.world.relationships.length > 0) {
    lines.push("Relationships:");
    for (const rel of state.world.relationships) {
      const from = state.world.entities.find((e) => e.id === rel.fromEntityId)?.name || rel.fromEntityId;
      const to = state.world.entities.find((e) => e.id === rel.toEntityId)?.name || rel.toEntityId;
      lines.push(`- ${from} → ${to}: ${rel.description}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats narrative foundation as context for the forge prompt.
 */
function formatFoundationContext(state: RootState): string {
  const { foundation } = state;
  const sections: string[] = [];

  if (foundation.shape) sections.push(`Shape: ${foundation.shape}`);
  if (foundation.intent) sections.push(`Intent: ${foundation.intent}`);
  if (foundation.worldState) sections.push(`World State: ${foundation.worldState}`);

  const activeTensions = foundation.tensions.filter((t) => !t.resolved);
  if (activeTensions.length > 0) {
    const tensionLines = activeTensions.map((t) => `- ${t.text}`).join("\n");
    sections.push(`Active Tensions:\n${tensionLines}`);
  }

  return sections.join("\n");
}

/**
 * Creates a message factory for a forge pass.
 * Reads Foundation + live world at JIT time for freshness.
 */
export const createForgeFactory = (
  getState: () => RootState,
  forgeIntent: string,
  brainstormContext?: string,
): MessageFactory => {
  return async () => {
    const systemPrompt = String(
      (await api.v1.config.get("forge_prompt")) || DEFAULT_FORGE_PROMPT,
    );

    const state = getState();
    const foundationContext = formatFoundationContext(state);
    const worldContext = formatLiveWorldContext(state);

    const messages: Message[] = [];

    messages.push({ role: "system", content: systemPrompt });

    if (foundationContext) {
      messages.push({ role: "system", content: foundationContext });
    }

    if (worldContext) {
      messages.push({ role: "system", content: worldContext });
    }

    const userParts: string[] = [];

    if (forgeIntent.trim()) {
      userParts.push(`FORGE INTENT: ${forgeIntent.trim()}`);
    }

    if (brainstormContext) {
      userParts.push(`BRAINSTORM CONTEXT:\n${brainstormContext}`);
    }

    if (!forgeIntent.trim() && !brainstormContext) {
      userParts.push("Generate a set of world elements that fit the narrative foundation above.");
    }

    messages.push(
      { role: "user", content: userParts.join("\n\n") },
      { role: "assistant", content: "[" },
    );

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

/**
 * Builds a forge strategy for intent-driven world element generation.
 */
export const buildForgeStrategy = (
  getState: () => RootState,
  batchId: string,
  forgeIntent: string,
  brainstormContext?: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createForgeFactory(getState, forgeIntent, brainstormContext),
    target: { type: "forge", batchId },
    prefillBehavior: "keep",
    assistantPrefill: "[",
    continuation: { maxCalls: 2 },
  };
};

const DEFAULT_FORGE_PROMPT = `You are a world-building assistant. Given a narrative foundation and forge intent, create a cohesive set of world elements using structured commands.

Command vocabulary:
  [CREATE <TYPE> "<Name>"]       — new world element (types: CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION, TOPIC)
  [REVISE "<Name>"]              — update existing element
  [LINK "<Name>" → "<Name>"]     — relationship between elements
  [DONE]                         — signal complete

After each CREATE or REVISE command, write a brief description (1-3 sentences) on the following lines.
After each LINK command, write the relationship description on the following line.

Create 4-8 elements that work together as a coherent cluster. Prefer CHARACTER and LOCATION types for the core, then add other types for texture. End with [DONE].`;
