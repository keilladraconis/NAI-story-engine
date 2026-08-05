// Unsent composer text, held per chat outside the component tree.
//
// The tab strip renders `tab === "chat" ? <Chat/> : <StoryEngine/>`, so
// switching to Story Engine UNMOUNTS the composer and any useState text dies
// with it — losing a long setup message the user had not sent yet.
//
// Module scope rather than storyStorage: the live runtime does not reliably
// round-trip set->get mid-session (see hooks.ts/useDraftField), and rather than
// the store because this is written on every keystroke — a reducer pass per
// character is exactly what the UI input rules forbid. Same shape as
// core/store/stream-buffer.ts, minus the subscriber list: the composer is the
// only reader and it already re-renders from its own local state.
//
// In memory only, so drafts live as long as the script instance. That covers
// tab switches and session navigation, not a reload of the NovelAI page.

const drafts = new Map<string, string>();

/** Unsent text for a chat, or "" when there is none. */
export function readComposerDraft(chatId: string): string {
  return drafts.get(chatId) ?? "";
}

/** Store unsent text for a chat. Empty text drops the entry rather than keeping "". */
export function writeComposerDraft(chatId: string, text: string): void {
  if (text) drafts.set(chatId, text);
  else drafts.delete(chatId);
}

/** Drop a chat's draft — call once its text has actually been sent or cleared. */
export function clearComposerDraft(chatId: string): void {
  drafts.delete(chatId);
}
