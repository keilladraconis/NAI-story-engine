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
  RESOLVED: '✅',
  OPEN: '⭕',
  CHARACTER: '👤',
  FACTION: '🏴',
  SYSTEM: '⚙️',
  SITUATION: '⚡',
  DESCRIPTION: '💬',
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
  // Find next tag marker: `[WORD]` or `[ID:xxx]` at start of a line
  const rest = text.slice(contentStart);
  const nextTag = rest.search(/\n\[[\w\s:]+\]/);
  const content = nextTag === -1 ? rest : rest.slice(0, nextTag);
  return content.trim();
}

/**
 * Parse ALL occurrences of a repeated tag, returning each tag's content.
 * For formats like:
 *   [OPEN] first precondition
 *   [OPEN] second precondition
 * Returns ["first precondition", "second precondition"].
 */
export function parseTagAll(text: string, tag: string): string[] {
  const marker = `[${tag}]`;
  const results: string[] = [];
  let pos = 0;
  while (true) {
    const start = text.indexOf(marker, pos);
    if (start === -1) break;
    const contentStart = start + marker.length;
    const rest = text.slice(contentStart);
    // Content extends to next [TAG] on a new line, or end of text
    const nextTag = rest.search(/\n\[[\w\s:]+\]/);
    const content = (nextTag === -1 ? rest : rest.slice(0, nextTag)).trim();
    if (content) results.push(content);
    pos = contentStart + (nextTag === -1 ? rest.length : nextTag);
  }
  return results;
}

/** Strip `[SCENE]` tag prefix, keeping the description. */
export function stripSceneTag(text: string): string {
  return text.replace(/^\[SCENE\]\s*/m, "").trim();
}

/** Strip `[OPENER]` tag prefix, keeping the description. */
export function stripOpenerTag(text: string): string {
  return text.replace(/^\[OPENER\]\s*/m, "").trim();
}

/** Split text into sections by `===` separator, trimmed and non-empty. */
export function splitSections(text: string, sep = "+++"): string[] {
  return text
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

