import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
} from "./types";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
} from "../utils/prompts";
import {
  forgeChatContinueRequested,
  forgeChatDiscussRequested,
} from "../store/effects/forge-chat-actions";
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

  // Forge is agentic and driven by a single button: type to discuss/instruct
  // (the forge emits actions only for what you ask), or send with an empty input
  // to run the next autonomous pass ("Forge Ahead"). The send button's label
  // tracks this (see SeBrainstormInput). Cast All / Discard All end the session,
  // so there is no Clear button.
  inputPlaceholder: "Discuss, instruct, or send empty to Forge Ahead…",
  sendLabel: "Send",
  showClearButton: false,

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
    // Cast All / Discard All moved to the bottom [Discard]/[Commit] bar
    // (ForgeCommitBar). The Back button leaves the forge view without ending
    // the session.
    return [
      { id: "back", kind: "backButton" },
      { id: "phase", kind: "phaseIndicator" },
      { id: "scrub", kind: "scrubIndicator" },
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
    // Block while a forge pass (phase turn or reference scrub) is already queued
    // or running — a second send would only stack another empty assistant turn.
    const rt = ctx.getState().runtime;
    const forgePending =
      rt.activeRequest?.type === "forgeChat" ||
      rt.activeRequest?.type === "forgeCleanup" ||
      rt.queue.some((r) => r.type === "forgeChat" || r.type === "forgeCleanup");
    if (forgePending) return true;

    const trimmed = content.trim();
    // Single-button forge: an empty send runs the next autonomous pass (Forge
    // Ahead); a non-empty send is a discuss/instruct turn. The continue/discuss
    // effects each guard against a forge request already being in flight, so a
    // second send while one is pending is a no-op rather than a stacked turn.
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
    ctx.dispatch(forgeChatDiscussRequested({ chatId: chat.id }));
    return true;
  },
};
