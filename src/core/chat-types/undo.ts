import type { ChatMessage } from "./types";

/** A Build reply that applied at least one command and still stands. */
export function isUndoable(m: ChatMessage): boolean {
  return (
    m.role === "assistant" &&
    m.mode === "build" &&
    !m.undone &&
    (m.forgeSegments ?? []).some(
      (s) =>
        s.kind === "action" && s.action.status === "applied" && !!s.action.undo,
    )
  );
}

/** Undo goes backwards one turn at a time: only the latest standing Build
 *  reply may be undone, since later turns may have built on earlier ones. */
export function latestUndoable(
  messages: ChatMessage[],
): ChatMessage | undefined {
  return [...messages].reverse().find(isUndoable);
}

/** True when removing everything after `fromId` would drop a Build reply
 *  whose commands are still applied, leaving them with nothing to undo them. */
export function pruneBlocked(messages: ChatMessage[], fromId: string): boolean {
  const at = messages.findIndex((m) => m.id === fromId);
  return at !== -1 && messages.slice(at + 1).some(isUndoable);
}
