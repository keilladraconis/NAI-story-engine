/**
 * Forge Chat Effects — Signal handlers for the Scenario chat.
 *
 * Three signals, each with a single handler:
 *   1. forgeChatContinueRequested  → queue a Build turn: append an assistant
 *                                     placeholder, submit a forgeChat generation.
 *                                     The request says whether the send was
 *                                     directed (typed) or empty.
 *   2. scenarioPlanRequested       → queue a Plan turn: an assistant placeholder
 *                                     and an ordinary chat generation. Nothing it
 *                                     writes is applied.
 *      Both do all of it before they yield, so the queue is what refuses a
 *      second send.
 *   3. entityDiscardRequested      → discard a manual draft ("+ Add Entity", not
 *                                     yet saved): delete the entity.
 *
 * All actions are local to this module — declared with a static `.type`
 * field so `matchesAction` can subscribe.
 */

import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch } from "../types";
import type { Chat } from "../../chat-types/types";
import { messageAdded } from "../slices/chat";
import { requestQueued } from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import { entityDeleted } from "../slices/world";
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findChat(state: RootState, id: string): Chat | undefined {
  return state.chat.chats.find((c) => c.id === id);
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

  // ─── Discard a manual draft ("+ Add Entity", not yet saved) ─────────────────
  subscribeEffect(
    matchesAction(entityDiscardRequested),
    async (action, { getState: latest }) => {
      const entity = latest().world.entitiesById[action.payload.entityId];
      if (!entity || entity.lifecycle !== "draft") return;
      dispatch(entityDeleted({ entityId: entity.id }));
    },
  );
}
