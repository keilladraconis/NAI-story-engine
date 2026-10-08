import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import {
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
  normalizeRegisterKey,
} from "../utils/prompts";
import {
  forgeChatContinueRequested,
  scenarioPlanRequested,
} from "../store/effects/forge-chat-actions";
import { messageAdded } from "../store/slices/chat";

export type ScenarioMode = "plan" | "build";

const MODES: readonly ScenarioMode[] = ["plan", "build"] as const;

/** The mode a send in this chat runs in. Anything but "build" is plan, so a
 *  chat saved before the modes existed opens talking, not building. */
export function scenarioMode(chat: Chat): ScenarioMode {
  return chat.subMode === "build" ? "build" : "plan";
}

/** The one chat a story is built in, in two modes. Plan is a conversation on
 *  the creative model and applies nothing. Build reads that conversation and
 *  writes commands, applied to draft entities and Threads when the turn
 *  completes (handlers/forge-chat.ts). The mode in force when the writer sends
 *  decides the turn. */
export const scenarioSpec: ChatTypeSpec<ScenarioMode> = {
  id: "scenario",
  displayName: "Scenario",
  lifecycle: "save",
  subModes: MODES,
  defaultSubMode: "plan",

  sendLabel: "Send",
  showClearButton: false,

  inputPlaceholderFor(chat: Chat): string {
    return scenarioMode(chat) === "build"
      ? "Say what to build, or send empty to build what you've discussed…"
      : "Talk the scenario through…";
  },

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return { title: "Scenario", initialMessages: [], subMode: "plan" };
  },

  systemPromptFor(chat: Chat, ctx: SpecCtx): string {
    const level = normalizeRegisterKey(
      ctx.getState().foundation.intensity?.level,
    );
    return scenarioMode(chat) === "build"
      ? buildScenarioBuildPrompt(level)
      : buildScenarioPlanPrompt(level);
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "mode", kind: "modeToggle" },
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
    // Refuse while any turn for this chat, or a reference scrub, is queued or
    // running: a second send would only stack another empty assistant turn.
    const rt = ctx.getState().runtime;
    const busy = [rt.activeRequest, ...rt.queue].some(
      (r) =>
        !!r &&
        r.status !== "cancelled" &&
        (r.type === "forgeChat" ||
          r.type === "forgeCleanup" ||
          r.id.startsWith(`chat-${chat.id}-`)),
    );
    if (busy) return true;

    const mode = scenarioMode(chat);
    const trimmed = content.trim();
    // Plan is a conversation and needs something said. An empty Build send
    // means "build what we've discussed", which needs a discussion.
    if (
      trimmed.length === 0 &&
      (mode === "plan" || chat.messages.length === 0)
    ) {
      return true;
    }
    if (trimmed.length > 0) {
      ctx.dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: api.v1.uuid(), role: "user", content: trimmed },
        }),
      );
    }
    ctx.dispatch(
      mode === "plan"
        ? scenarioPlanRequested({ chatId: chat.id })
        : forgeChatContinueRequested({ chatId: chat.id }),
    );
    return true;
  },
};
