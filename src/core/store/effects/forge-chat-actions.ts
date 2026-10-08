/**
 * Forge Chat action creators — isolated from forge-chat-effects.ts so that
 * chat-types/scenario.ts can import them without closing the cycle:
 *   scenario.ts → forge-chat-effects.ts → forge-chat-strategy.ts
 *              → context-builder.ts → chat-types/index.ts → scenario.ts
 */

export interface ForgeChatContinueRequestedPayload {
  chatId: string;
  /** Whether the writer typed something with this send. Absent on a retry,
   *  which carries no send; the strategy then reads the transcript's tail. */
  directed?: boolean;
}

const FORGE_CHAT_CONTINUE_REQUESTED = "forgeChat/continueRequested";
export const forgeChatContinueRequested = (
  payload: ForgeChatContinueRequestedPayload,
) => ({
  type: FORGE_CHAT_CONTINUE_REQUESTED as typeof FORGE_CHAT_CONTINUE_REQUESTED,
  payload,
});
forgeChatContinueRequested.type = FORGE_CHAT_CONTINUE_REQUESTED;

export interface ScenarioPlanRequestedPayload {
  chatId: string;
}

const SCENARIO_PLAN_REQUESTED = "forgeChat/planRequested";
export const scenarioPlanRequested = (
  payload: ScenarioPlanRequestedPayload,
) => ({
  type: SCENARIO_PLAN_REQUESTED as typeof SCENARIO_PLAN_REQUESTED,
  payload,
});
scenarioPlanRequested.type = SCENARIO_PLAN_REQUESTED;

export interface ScenarioTurnUndoRequestedPayload {
  chatId: string;
  messageId: string;
}

const SCENARIO_TURN_UNDO_REQUESTED = "forgeChat/turnUndoRequested";
export const scenarioTurnUndoRequested = (
  payload: ScenarioTurnUndoRequestedPayload,
) => ({
  type: SCENARIO_TURN_UNDO_REQUESTED as typeof SCENARIO_TURN_UNDO_REQUESTED,
  payload,
});
scenarioTurnUndoRequested.type = SCENARIO_TURN_UNDO_REQUESTED;

export interface ScenarioRetryRequestedPayload {
  chatId: string;
  messageId: string;
}

const SCENARIO_RETRY_REQUESTED = "forgeChat/retryRequested";
export const scenarioRetryRequested = (
  payload: ScenarioRetryRequestedPayload,
) => ({
  type: SCENARIO_RETRY_REQUESTED as typeof SCENARIO_RETRY_REQUESTED,
  payload,
});
scenarioRetryRequested.type = SCENARIO_RETRY_REQUESTED;
