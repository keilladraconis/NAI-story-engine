/**
 * Crucible World Formatter — Formats current world state for GLM context injection
 * and UI display during the build loop.
 */

import { RootState, CrucibleState, CrucibleWorldElement, WORLD_ENTRY_CATEGORIES } from "../store/types";
import { DulfsFieldID, FieldID, FIELD_CONFIGS } from "../../config/field-definitions";

/** Map World Entry field IDs to display labels (singular). */
const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

/** Map World Entry field IDs to display labels (plural). */
const FIELD_LABEL_PLURAL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
  [FieldID.Topics]: "Topics",
};

const MAX_DESC_LENGTH = 100;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

/**
 * Formats the full world state for GLM context injection.
 * Elements grouped by type, links listed, previous critique included.
 */
export function formatWorldState(state: CrucibleState): string {
  const sections: string[] = [];

  // Group elements by field
  const groups = new Map<DulfsFieldID, CrucibleWorldElement[]>();
  for (const el of state.elements) {
    const list = groups.get(el.fieldId) || [];
    list.push(el);
    groups.set(el.fieldId, list);
  }

  // Elements by category (stable order)
  if (state.elements.length > 0) {
    const elementLines: string[] = ["[WORLD STATE]"];
    for (const fieldId of WORLD_ENTRY_CATEGORIES) {
      const fieldElements = groups.get(fieldId);
      if (!fieldElements) continue;
      const label = FIELD_LABEL_PLURAL[fieldId] || fieldId;
      elementLines.push(`${label}:`);
      for (const el of fieldElements) {
        const desc = el.content ? `: ${truncate(el.content, MAX_DESC_LENGTH)}` : " [unfilled]";
        elementLines.push(`- ${el.name}${desc}`);
      }
    }
    sections.push(elementLines.join("\n"));
  }

  // Links
  if (state.links.length > 0) {
    const linkLines: string[] = ["[RELATIONSHIPS]"];
    for (const link of state.links) {
      const desc = link.description ? ` — ${link.description}` : "";
      linkLines.push(`- ${link.fromName} → ${link.toName}${desc}`);
    }
    sections.push(linkLines.join("\n"));
  }

  // Previous critique
  if (state.activeCritique) {
    sections.push(`[PREVIOUS CRITIQUE]\n${state.activeCritique}`);
  }

  return sections.join("\n\n");
}

/**
 * Formats a short UI summary of the world state.
 * Example: "3 Characters, 2 Locations, 1 Link"
 */
export function formatWorldSummary(state: CrucibleState): string {
  const counts = new Map<DulfsFieldID, number>();
  for (const el of state.elements) {
    counts.set(el.fieldId, (counts.get(el.fieldId) || 0) + 1);
  }

  const parts: string[] = [];
  for (const fieldId of WORLD_ENTRY_CATEGORIES) {
    const count = counts.get(fieldId);
    if (count) {
      const label = count === 1 ? FIELD_LABEL[fieldId] : FIELD_LABEL_PLURAL[fieldId];
      parts.push(`${count} ${label}`);
    }
  }

  if (state.links.length > 0) {
    parts.push(`${state.links.length} ${state.links.length === 1 ? "Link" : "Links"}`);
  }

  return parts.join(", ") || "Empty world";
}

/**
 * Formats crucible world elements as a structured list for injection into
 * lorebook generation context. Grouped by World Entry category, one line per element.
 * Returns empty string if no elements exist.
 */
export const formatCrucibleElementsContext = (state: RootState): string => {
  const { elements } = state.crucible;
  if (elements.length === 0) return "";

  const groups = new Map<string, typeof elements>();
  for (const el of elements) {
    const list = groups.get(el.fieldId) || [];
    list.push(el);
    groups.set(el.fieldId, list);
  }

  const lines: string[] = [];
  for (const [fieldId, fieldElements] of groups) {
    const label = FIELD_CONFIGS.find((f) => f.id === fieldId)?.label || fieldId;
    lines.push(`${label}:`);
    for (const el of fieldElements) {
      lines.push(`- ${el.content ? `${el.name}: ${el.content}` : el.name}`);
    }
  }
  return lines.join("\n");
};
