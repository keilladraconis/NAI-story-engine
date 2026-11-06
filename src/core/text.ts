// Small text helpers shared by the workshop and GLM work.

/** Strip `<think>` / `</think>` breakout artifacts from generated text. */
export function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

/**
 * A short, stable fingerprint of some text (FNV-1a, 32-bit, hex). Used to tell
 * whether a document changed since it was reviewed or compiled, and whether a
 * compiled entry was edited by hand. Whitespace at the ends is ignored so a
 * trailing newline is not an edit.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  const s = text.trim();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** First line of a text, trimmed and cut to `max` characters. */
export function firstLine(text: string, max = 60): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A Brief value as given, or "" when the writer left it open ("Unspecified", "None"). */
export function given(value: string): string {
  const v = value.trim();
  return /^(unspecified|none|n\/a)\.?$/i.test(v) ? "" : v;
}
