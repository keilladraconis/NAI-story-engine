// Small, pure helpers for the JSX chat UI. Kept framework-free so they are
// unit-testable headless.

// Must equal IDS.BRAINSTORM.INPUT — the storyStorage key the
// `uiChatSubmitUserMessage` effect reads the composer text from. Duplicated as a
// bare constant to avoid coupling ui-jsx to the SUI `ui/framework/ids` tree
// (which is slated for removal). If the effect's key ever changes, change here.
export const CHAT_INPUT_KEY = "se-bs-input";

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
