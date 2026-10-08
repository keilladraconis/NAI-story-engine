/**
 * Forge Chat Effects — Signal handlers for the Scenario chat.
 *
 * Four signals, each with a single handler:
 *   1. forgeChatContinueRequested  → queue a Build turn: append what the writer
 *                                     typed and an assistant placeholder, submit
 *                                     a forgeChat generation. The request says
 *                                     whether the send was directed (typed) or
 *                                     empty.
 *   2. scenarioPlanRequested       → queue a Plan turn: what the writer typed,
 *                                     an assistant placeholder and an ordinary
 *                                     chat generation. Nothing it writes is
 *                                     applied.
 *      Both do all of it before they yield, so the queue is what refuses a
 *      second send. The user's message is added here, after the guard, never
 *      by the sender: a refused send leaves no message with no turn.
 *   3. scenarioTurnUndoRequested   → reverse the latest standing Build reply.
 *   4. entityDiscardRequested      → discard a manual draft ("+ Add Entity", not
 *                                     yet saved): delete the entity.
 *
 * All actions are local to this module — declared with a static `.type`
 * field so `matchesAction` can subscribe.
 */

import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch } from "../types";
import type { Chat } from "../../chat-types/types";
import { messageAdded, messagesPrunedAfter } from "../slices/chat";
import { requestQueued } from "../slices/runtime";
import { generationSubmitted } from "../slices/ui";
import { entityDeleted } from "../slices/world";
import {
  buildScenarioBuildStrategy,
  buildScenarioPlanStrategy,
} from "../../utils/forge-chat-strategy";
import {
  isUndoable,
  latestUndoable,
  pruneBlocked,
} from "../../chat-types/undo";
import { undoTurn } from "./handlers/forge-chat";

// ─────────────────────────────────────────────────────────────────────────────
// Action creators — ForgeChatContinueRequested lives in forge-chat-actions.ts
// (a cycle-free module) so that chat-types/scenario.ts can import it without
// pulling in forge-chat-strategy → context-builder → chat-types/index → scenario.
// Re-exported here for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
  scenarioTurnUndoRequested,
  scenarioRetryRequested,
  type ForgeChatContinueRequestedPayload,
} from "./forge-chat-actions";
export {
  forgeChatContinueRequested,
  scenarioPlanRequested,
  scenarioTurnUndoRequested,
  scenarioRetryRequested,
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

/** The writer's message for a send that carried text. */
function userMessageAdded(chatId: string, content: string) {
  return messageAdded({
    chatId,
    message: { id: api.v1.uuid(), role: "user", content },
  });
}

/** True if a Scenario generation for this chat (a Build turn or a Plan
 *  turn) is already queued or in flight. Scenario sends guard on this
 *  so a second one is a no-op rather than another stacked empty assistant turn.
 *  A Plan turn is an ordinary chat request, told apart by its id. */
export function scenarioRequestPending(
  state: RootState,
  chatId: string,
): boolean {
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
  // Chats whose World is being reversed (an undo, or a retry's undo). The
  // work spans lorebook awaits, so any other Scenario work on the chat waits.
  const reversing = new Set<string>();
  const busy = (state: RootState, chatId: string): boolean =>
    reversing.has(chatId) || scenarioRequestPending(state, chatId);

  // ─── A Build turn ───────────────────────────────────────────────────────────
  subscribeEffect(
    matchesAction(forgeChatContinueRequested),
    async (action, { getState: latest }) => {
      const { chatId, directed, content } = action.payload;
      if (!findChat(latest(), chatId)) return;
      // No-op if a turn is already queued or running, so repeated sends cannot
      // stack empty turns and background generations.
      if (busy(latest(), chatId)) return;

      if (content) dispatch(userMessageAdded(chatId, content));
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
      const { chatId, content } = action.payload;
      const chat = findChat(latest(), chatId);
      if (!chat) return;
      if (busy(latest(), chatId)) return;

      // Nothing here is awaited: the writer's message and the placeholder are
      // added in the turn the send arrived in, and the request is in the queue
      // before a second send can be read, so the pending check above is the
      // whole re-entry guard. The strategy reads the chat when it runs, so it
      // sees the message added here.
      if (content) dispatch(userMessageAdded(chatId, content));
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

  // ─── Undo a Build turn ──────────────────────────────────────────────────────
  subscribeEffect(
    matchesAction(scenarioTurnUndoRequested),
    async (action, { getState: latest }) => {
      const { chatId, messageId } = action.payload;
      const chat = findChat(latest(), chatId);
      if (!chat || latestUndoable(chat.messages)?.id !== messageId) return;
      if (busy(latest(), chatId)) return;
      reversing.add(chatId);
      try {
        await undoTurn(latest, dispatch, chatId, messageId);
      } finally {
        reversing.delete(chatId);
      }
    },
  );

  // ─── Retry a Scenario reply ─────────────────────────────────────────────────
  // A Build reply is undone before it is re-run, or its first attempt would
  // stay applied under the second. A Plan reply applied nothing, so it is
  // only pruned.
  subscribeEffect(
    matchesAction(scenarioRetryRequested),
    async (action, { getState: latest }) => {
      const { chatId, messageId } = action.payload;
      const chat = findChat(latest(), chatId);
      const retried = chat?.messages.find((m) => m.id === messageId);
      if (!chat || !retried) return;
      if (busy(latest(), chatId)) return;
      // Pruning drops every later message. A later Build reply whose
      // commands still stand would be left with nothing to undo them.
      const blocked = () => {
        const now = findChat(latest(), chatId);
        if (!now || !pruneBlocked(now.messages, messageId)) return false;
        void api.v1.ui.toast("Undo the later Build turns first.", {
          type: "warning",
        });
        return true;
      };
      if (blocked()) return;
      if (isUndoable(retried)) {
        reversing.add(chatId);
        let undone: boolean;
        try {
          undone = await undoTurn(latest, dispatch, chatId, messageId);
        } finally {
          reversing.delete(chatId);
        }
        if (!undone) {
          void api.v1.ui.toast(
            "Undo did not finish, so the reply was not retried.",
            { type: "warning" },
          );
          return;
        }
      }
      if (blocked()) return;
      dispatch(messagesPrunedAfter({ chatId, id: messageId }));
      dispatch(
        retried.mode === "plan"
          ? scenarioPlanRequested({ chatId })
          : forgeChatContinueRequested({ chatId }),
      );
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
