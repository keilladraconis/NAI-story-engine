import type { RootState, WorldEntity } from "../types";

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

/**
 * True for an in-progress forge draft — an uncommitted entity that belongs to a
 * forge session (it renders as an inline card in that chat). The World section
 * hides these so a draft does not appear in two places at once; once cast to
 * "live" it shows in the World normally. Manual "+ Add Entity" drafts have no
 * `sourceChatId`, so they are NOT forge drafts and stay visible in the World.
 */
export function isForgeDraft(entity: WorldEntity): boolean {
  return entity.lifecycle === "draft" && !!entity.sourceChatId;
}

type ForgePhase = "sketch" | "expand" | "weave";

function nextForgePhase(current: string | undefined): ForgePhase {
  if (current === "sketch") return "expand";
  if (current === "expand") return "weave";
  if (current === "weave") return "sketch";
  return "sketch";
}

/** Number of uncommitted forge drafts belonging to a chat. */
export function selectForgeDraftPoolCount(
  state: RootState,
  chatId: string,
): number {
  return Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  ).length;
}

/** The phase the next forge continue will run: pool-empty forces sketch;
 *  otherwise a user pin wins, else auto-advance from the current subMode. */
export function selectForgeNextPhase(
  state: RootState,
  chatId: string,
): ForgePhase {
  if (selectForgeDraftPoolCount(state, chatId) === 0) return "sketch";
  const pinned = state.forge.pinnedNextPhaseByChatId?.[chatId];
  if (pinned) return pinned;
  const chat = state.chat.chats.find((c) => c.id === chatId);
  return nextForgePhase(chat?.subMode);
}
