/**
 * Tag Parser — Utilities for parsing tagged plaintext output from GLM.
 *
 * Format: `[TAG] content` where content extends until the next `[TAG]` or end of text.
 * Sections are separated by `+++`.
 */

import { WorldElements, NamedElement } from "../store/types";

/** Emoji mapping for tagged text display. */
const TAG_EMOJI: Record<string, string> = {
  "CORE TENSION": "\u{1F525}",
  "WORLD PREMISE": "\u{1F30D}",
  "NARRATIVE DIRECTION": "\u{1F9ED}",
  "TAGS": "\u{1F3F7}\u{FE0F}",
  "GOAL": "\u{1F3AF}",
  "STAKES": "\u{26A0}\u{FE0F}",
  "THEME": "\u{1F4A1}",
  "EMOTIONAL ARC": "\u{1F4AB}",
  "TERMINAL CONDITION": "\u{1F3C1}",
  "SCENE": "\u{1F3AC}",
  "CHARACTERS": "\u{1F464}",
  "LOCATION": "\u{1F4CD}",
  "CONFLICT": "\u{2694}\u{FE0F}",
  "WORLD ELEMENTS": "\u{1F310}",
  "RESOLVED": "\u{2705}",
  "OPEN": "\u{2B55}",
  "GROUND": "\u{26F0}\u{FE0F}",
  "NAME": "\u{1F4DB}",
  "TYPE": "\u{1F516}",
  "DESCRIPTION": "\u{1F4DD}",
  "PURPOSE": "\u{1F3AF}",
  "RELATIONSHIPS": "\u{1F517}",
};

/** Build reverse mapping: emoji → tag name. */
const EMOJI_TO_TAG: Map<string, string> = new Map(
  Object.entries(TAG_EMOJI).map(([tag, emoji]) => [emoji, tag]),
);

/** Replace `[TAG]` markers with emoji equivalents for display. */
export function formatTagsWithEmoji(text: string): string {
  return text.replace(/\[([A-Z\s]+)\]/g, (_match, tag: string) => {
    const emoji = TAG_EMOJI[tag];
    return emoji ? `${emoji}` : `**${tag}**`;
  });
}

/** Restore emoji markers back to `[TAG]` format for structural parsing. */
export function restoreTagsFromEmoji(text: string): string {
  let result = text;
  for (const [emoji, tag] of EMOJI_TO_TAG) {
    result = result.split(emoji).join(`[${tag}]`);
  }
  return result;
}

/** Extract content after `[TAG]` until the next `[TAG]` or end of text. */
export function parseTag(text: string, tag: string): string | null {
  const marker = `[${tag}]`;
  const start = text.indexOf(marker);
  if (start === -1) return null;

  const contentStart = start + marker.length;
  // Find next tag marker `[` that starts a `[SOMETHING]` pattern
  const rest = text.slice(contentStart);
  const nextTag = rest.search(/\n\[[\w\s]+\]/);
  const content = nextTag === -1 ? rest : rest.slice(0, nextTag);
  return content.trim();
}

/** Parse a semicolon-separated (or custom separator) list from a tag's content. */
export function parseTagList(text: string, tag: string, sep = ";"): string[] {
  const content = parseTag(text, tag);
  if (!content) return [];
  return content
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Split text into sections by `===` separator, trimmed and non-empty. */
export function splitSections(text: string, sep = "+++"): string[] {
  return text
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse `[WORLD ELEMENTS]` block for `- Type: Name — desc` lines.
 * Supports: Character, Location, Faction, System, Situation.
 */
export function parseWorldElementLines(text: string): WorldElements {
  const block = parseTag(text, "WORLD ELEMENTS");
  if (!block) {
    return { characters: [], locations: [], factions: [], systems: [], situations: [] };
  }

  const result: WorldElements = {
    characters: [],
    locations: [],
    factions: [],
    systems: [],
    situations: [],
  };

  const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"));
  for (const line of lines) {
    // Format: `- Type: Name — description` or `- Type: Name - description`
    const match = line.match(/^-\s*(Character|Location|Faction|System|Situation):\s*(.+)/i);
    if (!match) continue;

    const type = match[1].toLowerCase();
    const rest = match[2];

    // Split on ` — ` or ` - ` for name/description
    const dashIdx = rest.search(/\s[—-]\s/);
    let element: NamedElement;
    if (dashIdx !== -1) {
      element = {
        name: rest.slice(0, dashIdx).trim(),
        description: rest.slice(dashIdx).replace(/^\s[—-]\s/, "").trim(),
      };
    } else {
      element = { name: rest.trim(), description: "" };
    }

    if (type === "character") result.characters.push(element);
    else if (type === "location") result.locations.push(element);
    else if (type === "faction") result.factions.push(element);
    else if (type === "system") result.systems.push(element);
    else if (type === "situation") result.situations.push(element);
  }

  return result;
}
