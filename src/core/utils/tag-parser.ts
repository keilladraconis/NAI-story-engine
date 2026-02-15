/**
 * Tag Parser — Utilities for parsing tagged plaintext output from GLM.
 *
 * Format: `[TAG] content` where content extends until the next `[TAG]` or end of text.
 * Sections are separated by `+++`.
 */

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
  "LOCATION": "\u{1F4CD}",
  "CONFLICT": "\u{2694}\u{FE0F}",
  "RESOLVED": "\u{2705}",
  "OPEN": "\u{2B55}",
  "GROUND": "\u{26F0}\u{FE0F}",
  "CHARACTER": "\u{1F464}",
  "FACTION": "\u{1F3F4}",
  "SYSTEM": "\u{2699}\u{FE0F}",
  "SITUATION": "\u{26A1}",
  "DESCRIPTION": "\u{1F4DD}",
  "LINK": "\u{1F517}",
  "BEAT": "\u{1F3B5}",
  "SOLVER": "\u{1F504}",
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

