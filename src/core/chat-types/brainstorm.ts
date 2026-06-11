import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import {
  buildBrainstormPrompt,
  normalizeRegisterKey,
  XIALONG_STYLE,
} from "../utils/prompts";

type BrainstormSubMode = "cowriter" | "critic";

const SUB_MODES: readonly BrainstormSubMode[] = ["cowriter", "critic"] as const;

export const brainstormSpec: ChatTypeSpec<BrainstormSubMode> = {
  id: "brainstorm",
  displayName: "Brainstorm",
  lifecycle: "save",
  subModes: SUB_MODES,
  defaultSubMode: "cowriter",

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return {
      title: "Brainstorm",
      initialMessages: [],
      subMode: "cowriter",
    };
  },

  systemPromptFor(chat: Chat, ctx: SpecCtx): string {
    const level = normalizeRegisterKey(
      ctx.getState().foundation.intensity?.level,
    );
    const mode = chat.subMode === "critic" ? "critic" : "cowriter";
    return buildBrainstormPrompt(mode, level);
  },

  xialongStyleFor(chat: Chat, _ctx: SpecCtx): string {
    return chat.subMode === "critic"
      ? XIALONG_STYLE.brainstormCritic
      : XIALONG_STYLE.brainstorm;
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "sub-mode", kind: "subModeToggle" },
      { id: "summarize", kind: "summarizeButton" },
      { id: "new", kind: "newChatButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },
};
