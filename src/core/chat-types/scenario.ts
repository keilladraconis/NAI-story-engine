import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import {
  buildScenarioBuildPrompt,
  normalizeRegisterKey,
} from "../utils/prompts";
import { forgeChatContinueRequested } from "../store/effects/forge-chat-actions";
import { messageAdded } from "../store/slices/chat";

/** The one chat a story is built in. A reply is prose plus commands; the
 *  commands are applied to draft entities and Threads when the turn completes
 *  (handlers/forge-chat.ts). Three kinds of turn, told apart by the transcript
 *  (see forge-chat-strategy.ts): every turn is a sketch until a
 *  reply has applied a command, and from then on a message steers and an empty
 *  send grows the sketch. */
export const scenarioSpec: ChatTypeSpec = {
  id: "scenario",
  displayName: "Scenario",
  lifecycle: "save",

  inputPlaceholder:
    "Say what you want to see, steer the sketch, or send empty to grow it…",
  sendLabel: "Send",
  showClearButton: false,

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return { title: "Scenario", initialMessages: [] };
  },

  systemPromptFor(_chat: Chat, ctx: SpecCtx): string {
    return buildScenarioBuildPrompt(
      normalizeRegisterKey(ctx.getState().foundation.intensity?.level),
    );
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "scrub", kind: "scrubIndicator" },
      { id: "new", kind: "newChatButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },

  inlineEntityIdsFor(message, chat, ctx) {
    if (message.role !== "assistant") return [];
    return Object.values(ctx.getState().world.entitiesById)
      .filter(
        (e) =>
          e.sourceChatId === chat.id &&
          e.lifecycle === "draft" &&
          e.lastAffectingMessageId === message.id,
      )
      .map((e) => e.id);
  },

  handleSend(chat, content, ctx) {
    // Refuse while a turn or a reference scrub is queued or running: a second
    // send would only stack another empty assistant turn.
    const rt = ctx.getState().runtime;
    const isTurn = (t: string) => t === "forgeChat" || t === "forgeCleanup";
    if (
      (rt.activeRequest && isTurn(rt.activeRequest.type)) ||
      rt.queue.some((r) => isTurn(r.type))
    ) {
      return true;
    }

    const trimmed = content.trim();
    // An empty send grows the sketch. With nothing said yet there is nothing
    // to grow, and a turn would have no seed to answer.
    if (trimmed.length === 0 && chat.messages.length === 0) return true;
    if (trimmed.length > 0) {
      ctx.dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: api.v1.uuid(), role: "user", content: trimmed },
        }),
      );
    }
    ctx.dispatch(forgeChatContinueRequested({ chatId: chat.id }));
    return true;
  },
};
