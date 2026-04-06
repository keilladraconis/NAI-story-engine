/**
 * Escape raw text for markdown display: convert newlines to markdown
 * line-breaks and escape `<` to prevent HTML injection in views.
 * Returns `fallback` when the trimmed input is empty.
 */
export function escapeForMarkdown(raw: string, fallback = ""): string {
  if (!raw.trim()) return fallback;
  return raw.replace(/\n/g, "  \n").replace(/</g, "\\<");
}

/**
 * Batch-update the display visibility of multiple UI parts.
 * Each entry is [id, visible]: visible=true → display:flex, false → display:none.
 */
export function updateVisibility(
  updates: [id: string, visible: boolean][],
): void {
  api.v1.ui.updateParts(
    updates.map(([id, visible]) => ({
      id,
      style: visible ? { display: "flex" } : { display: "none" },
    })),
  );
}

export const calculateTextAreaHeight = (content: string): string => {
  const LINE_HEIGHT = 20; // Approx px
  const PADDING = 24;
  const MIN_HEIGHT = 60;

  if (!content) return `${MIN_HEIGHT}px`;

  // Simple heuristic: 60 chars per line wrap
  const wrappedLines = content.split("\n").reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil(line.length / 60));
  }, 0);

  const height = Math.max(MIN_HEIGHT, wrappedLines * LINE_HEIGHT + PADDING);
  return `${height}px`;
};
