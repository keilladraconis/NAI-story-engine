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

/** Has any brainstorm actually been talked in? A freshly minted session — and
 *  the default one the store seeds — carries no messages, so mere existence is
 *  not content. Drives the Setup tab's flow: the brainstorm prompt steps aside
 *  and the Foundation opens once there is something to work from. */
export function hasBrainstormContent(
  chats: ReadonlyArray<{ type: string; messages: ReadonlyArray<unknown> }>,
): boolean {
  return chats.some((c) => c.type === "brainstorm" && c.messages.length > 0);
}
