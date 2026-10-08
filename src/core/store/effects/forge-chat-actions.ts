/**
 * Forge Chat action creators — isolated from forge-chat-effects.ts so that
 * chat-types/scenario.ts can import them without closing the cycle:
 *   scenario.ts → forge-chat-effects.ts → forge-chat-strategy.ts
 *              → context-builder.ts → chat-types/index.ts → scenario.ts
 */

export interface ForgeChatContinueRequestedPayload {
  chatId: string;
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
