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

export type ScenarioMode = "plan" | "build";

const MODES: readonly ScenarioMode[] = ["plan", "build"] as const;

/** The mode a send in this chat runs in. Anything but "build" is plan, so a
 *  chat saved before the modes existed opens talking, not building. */
export function scenarioMode(chat: Chat): ScenarioMode {
  return chat.subMode === "build" ? "build" : "plan";
}

/** The one chat a story is built in, in two modes. Plan is a conversation on
 *  the creative model and applies nothing. Build reads that conversation and
 *  writes commands, applied to the World when the turn completes: live
 *  entities with their lorebook entries, and Threads (handlers/forge-chat.ts). The mode in force when the writer sends
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
      { id: "new", kind: "newChatButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },

  handleSend(chat, content, ctx) {
    // Only the empty-send rules are decided here. Whether the chat is free
    // is the effect's to say (a queued turn, or a reversal in progress), so
    // the text travels in the request and the effect adds the message once
    // its guard has passed: a refused send leaves no message behind.
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
    const text = trimmed.length > 0 ? { content: trimmed } : {};
    ctx.dispatch(
      mode === "plan"
        ? scenarioPlanRequested({ chatId: chat.id, ...text })
        : forgeChatContinueRequested({
            chatId: chat.id,
            directed: trimmed.length > 0,
            ...text,
          }),
    );
    return true;
  },
};
