import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import { BRAINSTORM_PROMPT, BRAINSTORM_CRITIC_PROMPT } from "../utils/prompts";

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

  systemPromptFor(chat: Chat, _ctx: SpecCtx): string {
    return chat.subMode === "critic" ? BRAINSTORM_CRITIC_PROMPT : BRAINSTORM_PROMPT;
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "sessions", kind: "sessionsButton" },
      { id: "sub-mode", kind: "subModeToggle" },
      { id: "summarize", kind: "summarizeButton" },
    ];
  },
};
