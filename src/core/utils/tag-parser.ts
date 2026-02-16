/**
 * Tag Parser — Utilities for parsing tagged plaintext output from GLM.
 *
 * Format: `[TAG] content` where content extends until the next `[TAG]` or end of text.
 * Sections are separated by `+++`.
 */

/** Emoji mapping for tagged text display. */
const TAG_EMOJI: Record<string, string> = {
  'CORE TENSION': '🔥',
  'WORLD PREMISE': '🌍',
  'NARRATIVE DIRECTION': '🧭',
  TAGS: '🏷️',
  GOAL: '🎯',
  STAKES: '⚠️',
  THEME: '💡',
  'EMOTIONAL ARC': '💫',
  'TERMINAL CONDITION': '🏁',
  SCENE: '🎬',
  LOCATION: '📍',
  CONFLICT: '⚔️',
  RESOLVED: '✅',
  OPEN: '⭕',
  GROUND: '⛰️',
  CHARACTER: '👤',
  FACTION: '🏴',
  SYSTEM: '⚙️',
  SITUATION: '⚡',
  DESCRIPTION: '💬',
  LINK: '🔗',
  BEAT: '📝',
  SOLVER: '🔄'
}

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

