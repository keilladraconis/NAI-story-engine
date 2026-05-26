import type { RootState } from "../types";

/**
 * Returns the id of the most-recently-added forge chat, or undefined if none.
 * Used by `SeForgeSection` (resume-vs-new branch) and by `plugin.ts`
 * (auto-switch to Chat tab when a forge chat becomes active).
 */
export function selectActiveForgeChatId(state: RootState): string | undefined {
  const chats = state.chat.chats;
  for (let i = chats.length - 1; i >= 0; i--) {
    if (chats[i].type === "forge") return chats[i].id;
  }
  return undefined;
}
