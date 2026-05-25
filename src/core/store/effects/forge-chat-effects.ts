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
import type { Chat } from "../../chat-types/types";
import { chatCreated, subModeChanged, messageAdded } from "../slices/chat";
import { requestQueued } from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import { tombstoneAdded } from "../slices/forge";
import { entityDeleted, entityLorebookEntryBound } from "../slices/world";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import { ensureCategory } from "./lorebook-sync";
import {
  buildForgeChatStrategy,
  buildForgeCleanupStrategy,
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
} from "./forge-chat-actions";
export { forgeChatContinueRequested, type ForgeChatContinueRequestedPayload };

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

const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

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

// ─────────────────────────────────────────────────────────────────────────────
// Effect registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerForgeChatEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // ─── Continue (advance phase + submit next turn) ────────────────────────────
  subscribeEffect(
    matchesAction(forgeChatContinueRequested),
    async (action, { getState: latest }) => {
      const { chatId } = action.payload;
      const state = latest();
      const chat = findChat(state, chatId);
      if (!chat) return;

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
      if (!entity) return;
      if (entity.lifecycle !== "draft") return;
      if (!entity.sourceChatId) return;

      const chatId = entity.sourceChatId;
      dispatch(
        tombstoneAdded({
          chatId,
          tombstone: {
            name: entity.name,
            category: FIELD_LABEL[entity.categoryId] ?? "Entity",
            reason: "user",
          },
        }),
      );
      dispatch(entityDeleted({ entityId }));

      const remaining = Object.values(latest().world.entitiesById).filter(
        (e) =>
          e.id !== entityId &&
          e.lifecycle === "draft" &&
          e.sourceChatId === chatId,
      );
      if (remaining.length === 0) return;

      const chat = findChat(latest(), chatId);
      if (!chat) return;

      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          chatId,
          message: {
            id: assistantId,
            role: "assistant",
            content: "",
            messageKind: "cleanup",
          },
        }),
      );

      const strategy = buildForgeCleanupStrategy(
        latest,
        chat,
        assistantId,
        entity.name,
      );
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "forgeCleanup",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // ─── New Session (fresh forge chat + first sketch turn) ─────────────────────
  subscribeEffect(
    matchesAction(forgeChatNewSessionRequested),
    async (action, { getState: latest }) => {
      const { initialUserMessage } = action.payload;
      const seedText = initialUserMessage?.trim();
      const chat: Chat = {
        id: api.v1.uuid(),
        type: "forge",
        title: "Forge",
        subMode: "sketch",
        messages: seedText
          ? [{ id: api.v1.uuid(), role: "user", content: seedText }]
          : [],
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
}
