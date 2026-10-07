import type { RootState, WorldEntity } from "../types";

/**
 * True for an in-progress draft of a Scenario chat — an uncommitted entity that
 * belongs to that chat (it renders as an inline card there). The World section
 * hides these so a draft does not appear in two places at once; once cast to
 * "live" it shows in the World normally. Manual "+ Add Entity" drafts have no
 * `sourceChatId`, so they are NOT forge drafts and stay visible in the World.
 */
export function isForgeDraft(entity: WorldEntity): boolean {
  return entity.lifecycle === "draft" && !!entity.sourceChatId;
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
