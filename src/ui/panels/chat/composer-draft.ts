// Unsent composer text, held per chat outside the component tree and persisted
// to storyStorage.
//
// The tab strip renders `tab === "chat" ? <Chat/> : <StoryEngine/>`, so
// switching to Story Engine UNMOUNTS the composer and any useState text dies
// with it — losing a long setup message the user had not sent yet.
//
// Two layers, because renders cannot await:
//   - an in-memory Map is the synchronous read/write path, so the composer has
//     its text on the very first render after remounting;
//   - a debounced write mirrors the Map into one storyStorage blob, so the
//     draft also survives a reload.
//
// Not the store: this is written on every keystroke, and a reducer pass per
// character is what the UI input rules rule out. The debounce is the same
// cancellation-flag shape as effects/autosave.ts (no timer id to store), just
// faster — the whole point is to lose as little typing as possible if the tab
// goes away before the save lands.

import { STORAGE_KEYS } from "../../../core/keys";

/** Shorter than autosave's 2s: unsent prose is the thing we least want to lose. */
const FLUSH_DELAY_MS = 1000;

const drafts = new Map<string, string>();
let cancelPendingFlush: (() => void) | null = null;

/** Serialize the Map into the single storyStorage blob. */
async function writeThrough(): Promise<void> {
  const blob: Record<string, string> = {};
  for (const [chatId, text] of drafts) blob[chatId] = text;
  await api.v1.storyStorage.set(STORAGE_KEYS.COMPOSER_DRAFTS, blob);
}

/** Debounced persist. Repeated keystrokes collapse into one write. */
function scheduleFlush(): void {
  cancelPendingFlush?.();
  let cancelled = false;
  cancelPendingFlush = () => {
    cancelled = true;
  };
  void api.v1.timers.setTimeout(() => {
    if (cancelled) return;
    cancelPendingFlush = null;
    void writeThrough();
  }, FLUSH_DELAY_MS);
}

/**
 * Load persisted drafts into memory. Call once at startup, before the panel
 * registers, so the composer's first render already has its text.
 *
 * `knownChatIds` prunes drafts whose chat has since been deleted — without it
 * the blob would only ever grow. Pass the ids after persisted state has loaded.
 */
export async function hydrateComposerDrafts(
  knownChatIds: readonly string[],
): Promise<void> {
  const stored: unknown = await api.v1.storyStorage.get(
    STORAGE_KEYS.COMPOSER_DRAFTS,
  );
  if (!stored || typeof stored !== "object") return;

  const live = new Set(knownChatIds);
  let pruned = false;
  for (const [chatId, text] of Object.entries(stored as object)) {
    if (typeof text !== "string" || !text) continue;
    if (!live.has(chatId)) {
      pruned = true;
      continue;
    }
    drafts.set(chatId, text);
  }
  if (pruned) await writeThrough();
}

/** Unsent text for a chat, or "" when there is none. */
export function readComposerDraft(chatId: string): string {
  return drafts.get(chatId) ?? "";
}

/** Store unsent text for a chat. Empty text drops the entry rather than keeping "". */
export function writeComposerDraft(chatId: string, text: string): void {
  if (text) drafts.set(chatId, text);
  else drafts.delete(chatId);
  scheduleFlush();
}

/**
 * Drop a chat's draft — call once its text has actually been sent or cleared.
 * Persists immediately rather than on the debounce: a sent message reappearing
 * in the box after a reload is worse than losing a second of typing.
 */
export function clearComposerDraft(chatId: string): void {
  if (!drafts.delete(chatId)) return;
  cancelPendingFlush?.();
  cancelPendingFlush = null;
  void writeThrough();
}
