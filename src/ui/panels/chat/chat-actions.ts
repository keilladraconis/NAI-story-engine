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

/** The brainstorm "Talk it through" should open, or null to start a fresh one.
 *
 *  The store seeds an empty "Brainstorm 1" and selects it, so the CTA's first
 *  click used to mint "Brainstorm 2" and leave the seeded one sitting empty
 *  beside it in Sessions. A chat with nothing said in it, already open, is the
 *  chat to talk in.
 *
 *  Scoped to the SELECTED chat rather than "any empty brainstorm": adopting some
 *  other idle session would move the writer somewhere they did not choose. And
 *  gated on type, because an empty forge or refine session is still that kind of
 *  session — its type drives the phase pills, the commit bar and whether the
 *  turn's text is parsed as commands. */
export function reusableBrainstormId(
  chats: ReadonlyArray<{
    id: string;
    type: string;
    messages: ReadonlyArray<unknown>;
  }>,
  activeChatId: string | null,
): string | null {
  if (!activeChatId) return null;
  const active = chats.find((c) => c.id === activeChatId);
  if (!active) return null;
  if (active.type !== "brainstorm") return null;
  return active.messages.length === 0 ? active.id : null;
}
