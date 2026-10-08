/**
 * Forge Chat Effects — Signal handlers for the Scenario chat.
 *
 * Four signals, each with a single handler:
 *   1. forgeChatContinueRequested  → queue a Build turn: append an assistant
 *                                     placeholder, submit a forgeChat generation.
 *                                     The request says whether the send was
 *                                     directed (typed) or empty.
 *      scenarioPlanRequested       → queue a Plan turn: an assistant placeholder
 *                                     and an ordinary chat generation. Nothing it
 *                                     writes is applied.
 *      Both do all of it before they yield, so the queue is what refuses a
 *      second send.
 *   2. entityDiscardRequested      → user-initiated draft discard: delete the
 *                                     entity.
 *   3. Cast / Cast All / Discard All → promote or drop drafts. The chat outlives
 *                                     them; none of these ends it.
 *
 * All actions are local to this module — declared with a static `.type`
 * field so `matchesAction` can subscribe.
 */

import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch, WorldEntity } from "../types";
import type { Chat } from "../../chat-types/types";
import { messageAdded, chatDeleted } from "../slices/chat";
import { requestQueued } from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import {
  entityDeleted,
  entityLorebookEntryBound,
  draftsReleasedFromChat,
} from "../slices/world";
import { ensureCategory } from "./lorebook-sync";
import { nameKey } from "./handlers/lorebook";
import {
  buildScenarioBuildStrategy,
  buildScenarioPlanStrategy,
} from "../../utils/forge-chat-strategy";

// ─────────────────────────────────────────────────────────────────────────────
// Action creators — ForgeChatContinueRequested lives in forge-chat-actions.ts
// (a cycle-free module) so that chat-types/scenario.ts can import it without
// pulling in forge-chat-strategy → context-builder → chat-types/index → scenario.
// Re-exported here for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
  type ForgeChatContinueRequestedPayload,
} from "./forge-chat-actions";
export {
  forgeChatContinueRequested,
  scenarioPlanRequested,
  type ForgeChatContinueRequestedPayload,
};

export interface EntityDiscardRequestedPayload {
  entityId: string;
}
const ENTITY_DISCARD_REQUESTED = "forgeChat/entityDiscardRequested";
export const entityDiscardRequested = (
  payload: EntityDiscardRequestedPayload,
) => ({
  type: ENTITY_DISCARD_REQUESTED as typeof ENTITY_DISCARD_REQUESTED,
  payload,
});
entityDiscardRequested.type = ENTITY_DISCARD_REQUESTED;

export interface EntityCastRequestedPayload {
  entityId: string;
}
const ENTITY_CAST_REQUESTED = "forgeChat/entityCastRequested";
export const entityCastRequested = (payload: EntityCastRequestedPayload) => ({
  type: ENTITY_CAST_REQUESTED as typeof ENTITY_CAST_REQUESTED,
  payload,
});
entityCastRequested.type = ENTITY_CAST_REQUESTED;

export interface ForgeCastAllRequestedPayload {
  chatId: string;
}
const FORGE_CAST_ALL_REQUESTED = "forgeChat/castAllRequested";
export const forgeCastAllRequested = (
  payload: ForgeCastAllRequestedPayload,
) => ({
  type: FORGE_CAST_ALL_REQUESTED as typeof FORGE_CAST_ALL_REQUESTED,
  payload,
});
forgeCastAllRequested.type = FORGE_CAST_ALL_REQUESTED;

export interface ForgeDiscardAllRequestedPayload {
  chatId: string;
}
const FORGE_DISCARD_ALL_REQUESTED = "forgeChat/discardAllRequested";
export const forgeDiscardAllRequested = (
  payload: ForgeDiscardAllRequestedPayload,
) => ({
  type: FORGE_DISCARD_ALL_REQUESTED as typeof FORGE_DISCARD_ALL_REQUESTED,
  payload,
});
forgeDiscardAllRequested.type = FORGE_DISCARD_ALL_REQUESTED;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findChat(state: RootState, id: string): Chat | undefined {
  return state.chat.chats.find((c) => c.id === id);
}

function poolFor(state: RootState, chatId: string): WorldEntity[] {
  return Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  );
}

/** True if a Scenario generation for this chat (a Build turn or a Plan
 *  turn) is already queued or in flight. Scenario sends guard on this
 *  so a second one is a no-op rather than another stacked empty assistant turn.
 *  A Plan turn is an ordinary chat request, told apart by its id. */
function scenarioRequestPending(state: RootState, chatId: string): boolean {
  return [state.runtime.activeRequest, ...state.runtime.queue].some(
    (r) =>
      !!r &&
      r.status !== "cancelled" &&
      (r.type === "forgeChat" || r.id.startsWith(`chat-${chatId}-`)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerForgeChatEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // ─── A Build turn ───────────────────────────────────────────────────────────
  subscribeEffect(
    matchesAction(forgeChatContinueRequested),
    async (action, { getState: latest }) => {
      const { chatId, directed } = action.payload;
      if (!findChat(latest(), chatId)) return;
      // No-op if a turn is already queued or running, so repeated sends cannot
      // stack empty turns and background generations.
      if (scenarioRequestPending(latest(), chatId)) return;

      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: {
            id: assistantId,
            role: "assistant",
            content: "",
            mode: "build",
          },
        }),
      );
      const chat = findChat(latest(), chatId);
      if (!chat) return;

      const strategy = buildScenarioBuildStrategy(
        latest,
        chat,
        assistantId,
        directed,
      );
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "forgeChat",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // ─── A Plan turn ────────────────────────────────────────────────────────────
  subscribeEffect(
    matchesAction(scenarioPlanRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const chat = findChat(latest(), chatId);
      if (!chat) return;
      if (scenarioRequestPending(latest(), chatId)) return;

      // Nothing here is awaited: the placeholder is added in the turn the send
      // arrived in, and the request is in the queue before a second send can
      // be read, so the pending check above is the whole re-entry guard.
      const assistantId = api.v1.uuid();
      const strategy = buildScenarioPlanStrategy(latest, chat, assistantId);
      dispatch(
        messageAdded({
          chatId,
          message: {
            id: assistantId,
            role: "assistant",
            content: "",
            mode: "plan",
          },
        }),
      );
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "chat",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // ─── Chat deleted (release its drafts) ──────────────────────────────────────
  // Deleting the chat is the only way a Scenario ends. Its drafts are hidden
  // from the World because the chat shows them, so without this they would be
  // unreachable.
  subscribeEffect(
    matchesAction(chatDeleted),
    async (action, { getState: latest }) => {
      const chatId = action.payload.id;
      // The reducer refuses to delete the last chat. A chat still here was not
      // deleted, and keeps its drafts.
      if (latest().chat.chats.some((c) => c.id === chatId)) return;
      dispatch(draftsReleasedFromChat({ chatId }));
    },
  );

  // ─── Entity Discard (user-initiated draft removal) ──────────────────────────
  subscribeEffect(
    matchesAction(entityDiscardRequested),
    async (action, { getState: latest }) => {
      const { entityId } = action.payload;
      const state = latest();
      const entity = state.world.entitiesById[entityId];
      if (!entity || entity.lifecycle !== "draft") return;

      dispatch(entityDeleted({ entityId }));
    },
  );

  // ─── Cast (promote a single draft to live by binding a lorebook entry) ──────
  subscribeEffect(
    matchesAction(entityCastRequested),
    async (action, { getState: latest }) => {
      const { entityId } = action.payload;
      const entity = latest().world.entitiesById[entityId];
      if (!entity) return;
      if (entity.lifecycle !== "draft") return;

      const categoryId = await ensureCategory(entity.categoryId);
      const allEntries = await api.v1.lorebook.entries();
      const existing = allEntries.find(
        (e) =>
          (e.displayName ?? "").toLowerCase() === entity.name.toLowerCase() &&
          !e.category,
      );

      let lorebookEntryId: string;
      if (existing) {
        lorebookEntryId = existing.id;
        await api.v1.lorebook.updateEntry(lorebookEntryId, {
          category: categoryId,
        });
      } else {
        lorebookEntryId = await api.v1.lorebook.createEntry({
          id: api.v1.uuid(),
          displayName: entity.name,
          text: "",
          keys: [nameKey(entity.name)],
          enabled: true,
          category: categoryId,
        });
      }

      dispatch(entityLorebookEntryBound({ entityId, lorebookEntryId }));
    },
  );

  // ─── Cast All (promote every draft) ─────────────────────────────────────────
  subscribeEffect(
    matchesAction(forgeCastAllRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const drafts = poolFor(latest(), chatId);
      // Casting does not end the session: the chat is the story's, and outlives any one batch of drafts.
      for (const entity of drafts) {
        dispatch(entityCastRequested({ entityId: entity.id }));
      }
    },
  );

  // ─── Discard All (delete every draft) ───────────────────────────
  subscribeEffect(
    matchesAction(forgeDiscardAllRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const drafts = poolFor(latest(), chatId);
      for (const entity of drafts) {
        dispatch(entityDeleted({ entityId: entity.id }));
      }
    },
  );
}
