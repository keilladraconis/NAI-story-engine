/**
 * Forge Chat Effects — Signal handlers for the typed-chat Forge.
 *
 * Three signal actions, each with a single handler:
 *   1. forgeChatContinueRequested  → advance subMode (sketch→expand→weave→sketch),
 *                                     force "sketch" if the draft pool is empty,
 *                                     append an assistant placeholder, submit a
 *                                     forgeChat generation.
 *   2. entityDiscardRequested      → user-initiated draft discard. Tombstone with
 *                                     reason="user", delete the entity, and (if
 *                                     other drafts remain) submit a forgeCleanup
 *                                     turn to scrub references.
 *   3. forgeChatNewSessionRequested → create a fresh forge chat, optionally seed
 *                                     a user message, append an assistant
 *                                     placeholder, submit the first sketch turn.
 *
 * All three actions are local to this module — declared with a static `.type`
 * field so `matchesAction` can subscribe.
 */

import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch, WorldEntity } from "../types";
import type { Chat, ChatMessage } from "../../chat-types/types";
import { buildForgeBriefing } from "../../utils/context-builder";
import {
  chatCreated,
  chatDeleted,
  subModeChanged,
  messageAdded,
} from "../slices/chat";
import { requestQueued } from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import {
  tombstoneAdded,
  tombstonesClearedForChat,
  scrubQueued,
  scrubCleared,
} from "../slices/forge";
import { entityDeleted, entityLorebookEntryBound } from "../slices/world";
import { DULFS_CATEGORY_LABELS } from "../../utils/category-detect";
import { ensureCategory } from "./lorebook-sync";
import {
  buildForgeChatStrategy,
  buildForgeCleanupStrategy,
  buildForgeDiscussStrategy,
} from "../../utils/forge-chat-strategy";

// ─────────────────────────────────────────────────────────────────────────────
// Action creators — ForgeChatContinueRequested lives in forge-chat-actions.ts
// (a cycle-free module) so that chat-types/forge.ts can import it without
// pulling in forge-chat-strategy → context-builder → chat-types/index → forge.
// Re-exported here for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

import {
  forgeChatContinueRequested,
  type ForgeChatContinueRequestedPayload,
  forgeChatDiscussRequested,
  type ForgeChatDiscussRequestedPayload,
} from "./forge-chat-actions";
export {
  forgeChatContinueRequested,
  type ForgeChatContinueRequestedPayload,
  forgeChatDiscussRequested,
  type ForgeChatDiscussRequestedPayload,
};

export interface ForgeScrubNowRequestedPayload {
  chatId: string;
}
const FORGE_SCRUB_NOW_REQUESTED = "forgeChat/scrubNowRequested";
export const forgeScrubNowRequested = (
  payload: ForgeScrubNowRequestedPayload,
) => ({
  type: FORGE_SCRUB_NOW_REQUESTED as typeof FORGE_SCRUB_NOW_REQUESTED,
  payload,
});
forgeScrubNowRequested.type = FORGE_SCRUB_NOW_REQUESTED;

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
export const forgeCastAllRequested = (payload: ForgeCastAllRequestedPayload) => ({
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

export interface ForgeChatNewSessionRequestedPayload {
  initialUserMessage?: string;
}
const FORGE_CHAT_NEW_SESSION_REQUESTED = "forgeChat/newSessionRequested";
export const forgeChatNewSessionRequested = (
  payload: ForgeChatNewSessionRequestedPayload,
) => ({
  type: FORGE_CHAT_NEW_SESSION_REQUESTED as typeof FORGE_CHAT_NEW_SESSION_REQUESTED,
  payload,
});
forgeChatNewSessionRequested.type = FORGE_CHAT_NEW_SESSION_REQUESTED;

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

function nextPhase(current: string | undefined): "sketch" | "expand" | "weave" {
  if (current === "sketch") return "expand";
  if (current === "expand") return "weave";
  if (current === "weave") return "sketch";
  return "sketch";
}

/**
 * Ends a forge session (the explicit close performed by Cast All / Discard All):
 * drops the chat and its transient forge state so the Forge button starts a
 * fresh session next time instead of resuming this one.
 */
function closeForgeSession(dispatch: AppDispatch, chatId: string): void {
  dispatch(scrubCleared({ chatId }));
  dispatch(tombstonesClearedForChat({ chatId }));
  dispatch(chatDeleted({ id: chatId }));
}

/**
 * Runs the deferred reference-scrub for a chat if one is pending: submit one
 * forgeCleanup turn over the discarded names (only if drafts remain to scrub),
 * then clear the pending list. Shared by the Forge Ahead lead-off and the
 * on-demand scrub control.
 */
function runPendingScrub(
  latest: () => RootState,
  dispatch: AppDispatch,
  chatId: string,
): void {
  const pending = latest().forge.pendingScrubByChatId[chatId] ?? [];
  if (pending.length === 0) return;
  if (poolFor(latest(), chatId).length > 0) {
    const chat = findChat(latest(), chatId);
    if (chat) {
      const cleanupId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: {
            id: cleanupId,
            role: "assistant",
            content: "",
            messageKind: "cleanup",
          },
        }),
      );
      const cleanupChat = findChat(latest(), chatId)!;
      const cleanupStrategy = buildForgeCleanupStrategy(
        latest,
        cleanupChat,
        cleanupId,
        pending,
      );
      dispatch(
        requestQueued({
          id: cleanupStrategy.requestId,
          type: "forgeCleanup",
          targetId: cleanupId,
        }),
      );
      dispatch(generationSubmitted(cleanupStrategy));
    }
  }
  dispatch(scrubCleared({ chatId }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerForgeChatEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // ─── Discuss (conversational turn; emits commands only on request) ──────────
  subscribeEffect(
    matchesAction(forgeChatDiscussRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const chat = findChat(latest(), chatId);
      if (!chat) return;

      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );

      const updatedChat = findChat(latest(), chatId);
      if (!updatedChat) return;

      const strategy = buildForgeDiscussStrategy(latest, updatedChat, assistantId);
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

  // ─── Scrub Now (run the deferred reference-cleanup on demand) ───────────────
  subscribeEffect(
    matchesAction(forgeScrubNowRequested),
    async (action, { getState: latest }) => {
      runPendingScrub(latest, dispatch, action.payload.chatId);
    },
  );

  // ─── Continue (advance phase + submit next turn) ────────────────────────────
  subscribeEffect(
    matchesAction(forgeChatContinueRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const chat = findChat(latest(), chatId);
      if (!chat) return;

      // Lead off with the deferred references-cleanup (if any) before the phase
      // turn. Queued first, so it runs and scrubs the pool before the phase
      // turn's JIT factory builds its context.
      runPendingScrub(latest, dispatch, chatId);

      const state = latest();
      const pool = poolFor(state, chatId);
      const advance = action.payload.advancePhase !== false;
      const target = !advance
        ? (chat.subMode ?? "sketch")
        : (pool.length === 0 ? "sketch" : nextPhase(chat.subMode));
      dispatch(subModeChanged({ id: chatId, subMode: target }));

      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );

      const updatedChat = findChat(latest(), chatId);
      if (!updatedChat) return;

      const strategy = buildForgeChatStrategy(latest, updatedChat, assistantId);
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

  // ─── Entity Discard (user-initiated draft removal) ──────────────────────────
  subscribeEffect(
    matchesAction(entityDiscardRequested),
    async (action, { getState: latest }) => {
      const { entityId } = action.payload;
      const state = latest();
      const entity = state.world.entitiesById[entityId];
      if (!entity || entity.lifecycle !== "draft") return;

      // Manual ("+ Add Entity") drafts belong to no forge session — just delete
      // them. Tombstone + pending-scrub are forge-session concepts, so skip them.
      if (!entity.sourceChatId) {
        dispatch(entityDeleted({ entityId }));
        return;
      }

      const chatId = entity.sourceChatId;
      dispatch(
        tombstoneAdded({
          chatId,
          tombstone: {
            name: entity.name,
            category: DULFS_CATEGORY_LABELS[entity.categoryId] ?? "Entity",
            reason: "user",
          },
        }),
      );
      dispatch(entityDeleted({ entityId }));

      // Defer the reference scrub rather than forging on every discard: flag
      // the name so the next Continue Forging leads with one cleanup turn. Only
      // worth scrubbing if other drafts remain that could mention it.
      const otherDraftsRemain = Object.values(latest().world.entitiesById).some(
        (e) =>
          e.id !== entityId &&
          e.lifecycle === "draft" &&
          e.sourceChatId === chatId,
      );
      if (otherDraftsRemain) {
        dispatch(scrubQueued({ chatId, names: [entity.name] }));
      }
    },
  );

  // ─── New Session (fresh forge chat + first sketch turn) ─────────────────────
  subscribeEffect(
    matchesAction(forgeChatNewSessionRequested),
    async (action, { getState: latest }) => {
      const { initialUserMessage } = action.payload;
      const seedText = initialUserMessage?.trim();

      // Capture the frozen briefing BEFORE chatCreated fires — at this point
      // activeSavedChat still resolves to the brainstorm the user came from,
      // not the forge chat we are about to create.
      const briefing = await buildForgeBriefing(latest);

      const messages: ChatMessage[] = [];
      if (briefing) {
        messages.push({ id: api.v1.uuid(), role: "system", content: briefing });
      }
      if (seedText) {
        messages.push({ id: api.v1.uuid(), role: "user", content: seedText });
      }

      const chat: Chat = {
        id: api.v1.uuid(),
        type: "forge",
        title: "Forge",
        subMode: "sketch",
        messages,
        seed: { kind: "blank" },
      };
      dispatch(chatCreated({ chat }));

      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: assistantId, role: "assistant", content: "" },
        }),
      );

      const seeded = findChat(latest(), chat.id) ?? chat;
      const strategy = buildForgeChatStrategy(latest, seeded, assistantId);
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
          keys: [],
          enabled: true,
          category: categoryId,
        });
      }

      dispatch(entityLorebookEntryBound({ entityId, lorebookEntryId }));
    },
  );

  // ─── Cast All (promote every draft, then close the session) ─────────────────
  subscribeEffect(
    matchesAction(forgeCastAllRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const drafts = poolFor(latest(), chatId);
      for (const entity of drafts) {
        dispatch(entityCastRequested({ entityId: entity.id }));
      }
      // Cast All is the explicit session close — drop the chat so a later Forge
      // starts fresh. Per-entity casts run async off the dispatches above and
      // reference entities, not the chat, so deleting it here is safe.
      closeForgeSession(dispatch, chatId);
    },
  );

  // ─── Discard All (tombstone + delete every draft, then close the session) ───
  subscribeEffect(
    matchesAction(forgeDiscardAllRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const drafts = poolFor(latest(), chatId);
      for (const entity of drafts) {
        dispatch(
          tombstoneAdded({
            chatId,
            tombstone: {
              name: entity.name,
              category: DULFS_CATEGORY_LABELS[entity.categoryId] ?? "Entity",
              reason: "user",
            },
          }),
        );
        dispatch(entityDeleted({ entityId: entity.id }));
      }
      // No cleanup turn: every draft is gone, so there is nothing left to scrub.
      // Discard All also closes the session.
      closeForgeSession(dispatch, chatId);
    },
  );
}
