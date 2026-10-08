import type { ChatMessage } from "./types";

/** A Build reply with at least one applied command that carries an undo
 *  record, and has not been undone: its commands still stand. */
export function hasStandingCommands(m: ChatMessage): boolean {
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

/** A Build reply that applied at least one command and still stands. */
export const isUndoable = hasStandingCommands;

/** Undo goes backwards one turn at a time: only the latest standing Build
 *  reply may be undone, since later turns may have built on earlier ones. */
export function latestUndoable(
  messages: ChatMessage[],
): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isUndoable(messages[i])) return messages[i];
  }
  return undefined;
}

/** True when removing everything after `fromId` would drop a Build reply
 *  whose commands are still applied, leaving them with nothing to undo them. */
export function pruneBlocked(messages: ChatMessage[], fromId: string): boolean {
  const at = messages.findIndex((m) => m.id === fromId);
  return at !== -1 && messages.slice(at + 1).some(isUndoable);
}
