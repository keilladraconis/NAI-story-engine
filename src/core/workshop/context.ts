// Replacing an editor Send's context. The editor's own message shape is kept
// and only its contents change: Xialong's native context is a system message, a
// user message `Relevant persistent information:⏎<Memory>⏎***⏎Write.`, and the
// page as the assistant prefill. Matching roles by name, not position, keeps
// the system message (and anything else) as the model expects it.

/** The prefill NovelAI gives an empty page. */
export const EMPTY_PAGE_PREFILL = "***\n";

export function workshopUserMessage(frame: string, direction: string): string {
  return `Relevant persistent information:\n${frame}\n***\n${direction}`;
}

/** A framed Send: our frame and direction, the draft as the prefill. */
export function replaceContext(
  native: Message[],
  frame: string,
  direction: string,
  draft: string,
): Message[] {
  const user: Message = {
    role: "user",
    content: workshopUserMessage(frame, direction),
  };
  const prefill: Message = {
    role: "assistant",
    content: draft || EMPTY_PAGE_PREFILL,
  };
  const out: Message[] = [];
  let placedUser = false;
  let placedPrefill = false;
  for (const message of native) {
    if (message.role === "user") {
      if (!placedUser) out.push(user);
      placedUser = true;
    } else if (message.role === "assistant") {
      // The direction has to come before the prefill it directs.
      if (!placedUser) out.push(user);
      placedUser = true;
      if (!placedPrefill) out.push(prefill);
      placedPrefill = true;
    } else out.push(message);
  }
  if (!placedUser) out.push(user);
  if (!placedPrefill) out.push(prefill);
  return out;
}

/**
 * The opening's Send: NovelAI's own context (distilled Memory, Author's Note,
 * activated entries) with the direction in place of the trailing `Write.`.
 */
export function directOnly(native: Message[], direction: string): Message[] {
  const last = native.map((m) => m.role).lastIndexOf("user");
  if (last === -1) return native;
  return native.map((m, i) =>
    i === last
      ? { ...m, content: (m.content ?? "").replace(/Write\.\s*$/, direction) }
      : m,
  );
}
