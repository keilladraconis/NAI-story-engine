// Small, pure helpers for the JSX chat UI. Kept framework-free so they are
// unit-testable headless.

/** Adaptive Foundation zap: an empty field generates, a field with content
 *  opens a refine. Mirrors SUI's SeGenRefinePair unified mode. */
export function decideFieldAction(text: string): "generate" | "refine" {
  return text.trim() === "" ? "generate" : "refine";
}

/** Title for a newly created brainstorm chat: "Brainstorm N". */
export function nextBrainstormTitle(
  chats: ReadonlyArray<{ type: string }>,
): string {
  const count = chats.filter((c) => c.type === "brainstorm").length;
  return `Brainstorm ${count + 1}`;
}
