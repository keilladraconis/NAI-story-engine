/**
 * Forge Chat action creators — isolated from forge-chat-effects.ts so that
 * chat-types/forge.ts can import them without closing the cycle:
 *   forge.ts → forge-chat-effects.ts → forge-chat-strategy.ts
 *              → context-builder.ts → chat-types/index.ts → forge.ts
 */

export interface ForgeChatContinueRequestedPayload {
  chatId: string;
  /** When false, keep the current phase. Defaults to true (advance per loop logic). */
  advancePhase?: boolean;
}

const FORGE_CHAT_CONTINUE_REQUESTED = "forgeChat/continueRequested";
export const forgeChatContinueRequested = (
  payload: ForgeChatContinueRequestedPayload,
) => ({
  type: FORGE_CHAT_CONTINUE_REQUESTED as typeof FORGE_CHAT_CONTINUE_REQUESTED,
  payload,
});
forgeChatContinueRequested.type = FORGE_CHAT_CONTINUE_REQUESTED;
