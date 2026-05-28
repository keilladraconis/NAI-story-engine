import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
} from "../utils/prompts";
import { forgeChatContinueRequested } from "../store/effects/forge-chat-actions";
import { messageAdded } from "../store/slices/chat";

type ForgePhase = "sketch" | "expand" | "weave";

const SUB_MODES: readonly ForgePhase[] = ["sketch", "expand", "weave"] as const;

const PROMPT_BY_PHASE: Record<ForgePhase, string> = {
  sketch: FORGE_SKETCH_PROMPT,
  expand: FORGE_EXPAND_PROMPT,
  weave: FORGE_WEAVE_PROMPT,
};

function resolvePhase(subMode: string | undefined): ForgePhase {
  if (subMode === "expand" || subMode === "weave") return subMode;
  return "sketch";
}

export const forgeSpec: ChatTypeSpec<ForgePhase> = {
  id: "forge",
  displayName: "Forge",
  lifecycle: "save",
  subModes: SUB_MODES,
  defaultSubMode: "sketch",

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return {
      title: "Forge",
      initialMessages: [],
      subMode: "sketch",
    };
  },

  systemPromptFor(chat: Chat, _ctx: SpecCtx): string {
    return PROMPT_BY_PHASE[resolvePhase(chat.subMode)];
  },

  contextSlice(chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return chat.messages;
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [
      { id: "phase", kind: "phaseIndicator" },
      { id: "cast-all", kind: "castAllButton" },
      { id: "discard-all", kind: "discardAllButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
  },

  inlineEntityIdsFor(message, chat, ctx) {
    if (message.role !== "assistant") return [];
    const state = ctx.getState();
    return Object.values(state.world.entitiesById)
      .filter(
        (e) =>
          e.sourceChatId === chat.id &&
          e.lifecycle === "draft" &&
          e.lastAffectingMessageId === message.id,
      )
      .map((e) => e.id);
  },

  handleSend(chat, content, ctx) {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      ctx.dispatch(forgeChatContinueRequested({ chatId: chat.id }));
      return true;
    }
    ctx.dispatch(
      messageAdded({
        chatId: chat.id,
        message: { id: api.v1.uuid(), role: "user", content: trimmed },
      }),
    );
    ctx.dispatch(
      forgeChatContinueRequested({ chatId: chat.id, advancePhase: false }),
    );
    return true;
  },
};
