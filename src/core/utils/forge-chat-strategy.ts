/**
 * Forge Chat Strategy — per-turn message factory for typed-chat Forge sessions.
 *
 * Two strategies live here:
 *   1. buildForgeChatStrategy — primary per-phase generation (sketch/expand/weave).
 *   2. buildForgeCleanupStrategy — post-discard reference scrubber.
 *
 * Both share the unified Story Engine prefix (with `excludeChat: true`, since
 * we inject the forge chat's own transcript directly), then layer phase-aware
 * system prompts, a [POOL]/[LIVE]/[TOMBSTONES]/[PREVIOUS CRITIQUE] context
 * block, and the chat transcript itself (minus the in-progress placeholder).
 */

import type { Chat, ChatMessage } from "../chat-types/types";
import type {
  GenerationStrategy,
  RootState,
  WorldEntity,
} from "../store/types";
import { buildStoryEnginePrefix } from "./context-builder";
import { buildModelParams, appendXialongStyleMessage } from "./config";
import {
  FORGE_SKETCH_PROMPT,
  FORGE_EXPAND_PROMPT,
  FORGE_WEAVE_PROMPT,
  FORGE_CLEANUP_PROMPT,
  XIALONG_STYLE,
} from "./prompts";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";

// --- Field labels for human-readable category names ---

const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

// --- Phase table ---

type ForgePhase = "sketch" | "expand" | "weave";

interface PhaseConfig {
  prompt: string;
  maxTokens: number;
  temperature: number;
}

const PHASE_TABLE: Record<ForgePhase, PhaseConfig> = {
  sketch: { prompt: FORGE_SKETCH_PROMPT, maxTokens: 1536, temperature: 0.90 },
  expand: { prompt: FORGE_EXPAND_PROMPT, maxTokens: 1280, temperature: 0.85 },
  weave: { prompt: FORGE_WEAVE_PROMPT, maxTokens: 1536, temperature: 0.80 },
};

function resolvePhase(subMode: string | undefined): ForgePhase {
  if (subMode === "expand") return "expand";
  if (subMode === "weave") return "weave";
  return "sketch";
}

// --- Critique extraction ---

/**
 * Walks the transcript from end. On the first assistant message encountered,
 * checks for a `[CRITIQUE | ...]` trailing block and returns the trimmed body.
 * Earlier assistant messages are ignored once we've seen the most recent.
 */
export function extractLastCritique(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (!m.content) return null;
    const match = m.content.match(/\[CRITIQUE\s*\|\s*([\s\S]+?)\]\s*$/);
    if (!match) return null;
    return match[1].trim();
  }
  return null;
}

// --- Context block formatters ---

function formatEntityLine(e: WorldEntity, prefix: "D" | "L"): string {
  const label = FIELD_LABEL[e.categoryId] ?? "Entity";
  const summary = e.summary ? ` — ${e.summary.slice(0, 160)}` : "";
  return `${prefix}:${e.id} — ${e.name} (${label})${summary}`;
}

function formatPool(state: RootState, chatId: string): string {
  const drafts = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  );
  if (drafts.length === 0) return "";
  const lines = ["[POOL] (drafts you may modify; IDs prefix D:)"];
  for (const e of drafts) lines.push(formatEntityLine(e, "D"));
  return lines.join("\n");
}

function formatLive(state: RootState): string {
  const live = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "live",
  );
  if (live.length === 0) return "";
  const lines = [
    "[LIVE] (read-only context; never modify or delete; IDs prefix L:)",
  ];
  for (const e of live) lines.push(formatEntityLine(e, "L"));
  return lines.join("\n");
}

function formatTombstones(state: RootState, chatId: string): string {
  const tombs = state.forge.tombstonesByChatId[chatId] ?? [];
  if (tombs.length === 0) return "";
  const lines = [
    "[TOMBSTONES] (discarded this session; do not recreate)",
    ...tombs.map(
      (t) => `- ${t.name} (${t.category}) — discarded by ${t.reason}`,
    ),
  ];
  return lines.join("\n");
}

function formatPreviousCritique(messages: ChatMessage[]): string {
  const critique = extractLastCritique(messages);
  if (!critique) return "";
  return `[PREVIOUS CRITIQUE]\n${critique}\n\nAddress this critique before adding new work.`;
}

function transcriptOf(chat: Chat, excludeMessageId: string): ChatMessage[] {
  return chat.messages.filter((m) => m.id !== excludeMessageId);
}

// --- Strategies ---

export function buildForgeChatStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  const factory = async () => {
    const phase = resolvePhase(chat.subMode);
    const { prompt, maxTokens, temperature } = PHASE_TABLE[phase];

    const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true });
    const state = getState();

    const system: Message = { role: "system", content: prompt };

    const blocks: string[] = [];
    const pool = formatPool(state, chat.id);
    if (pool) blocks.push(pool);
    const live = formatLive(state);
    if (live) blocks.push(live);
    const tombs = formatTombstones(state, chat.id);
    if (tombs) blocks.push(tombs);
    const prevCritique = formatPreviousCritique(chat.messages);
    if (prevCritique) blocks.push(prevCritique);

    const contextBlock: Message[] =
      blocks.length > 0
        ? [{ role: "assistant", content: blocks.join("\n\n") }]
        : [];

    const transcript: Message[] = transcriptOf(chat, assistantMessageId).map(
      (m) => ({ role: m.role, content: m.content }),
    );

    const messages: Message[] = [
      ...prefix,
      system,
      ...contextBlock,
      ...transcript,
    ];

    await appendXialongStyleMessage(messages, XIALONG_STYLE.forge);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: maxTokens,
        temperature,
        min_p: 0.05,
      }),
    };
  };

  return {
    requestId: `forge-chat-${chat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeChat",
      chatId: chat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    assistantPrefill: "[",
  };
}

export function buildForgeCleanupStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
  discardedName: string,
): GenerationStrategy {
  const factory = async () => {
    const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true });
    const state = getState();

    const system: Message = { role: "system", content: FORGE_CLEANUP_PROMPT };

    const pool = formatPool(state, chat.id);
    const contextBlock: Message[] = pool
      ? [{ role: "assistant", content: pool }]
      : [];

    const userInstruction: Message = {
      role: "user",
      content: `Discarded entity: "${discardedName}". Emit REVISE commands for any draft in the pool that references "${discardedName}" — by name, nickname, partial name, or indirect role-reference. If no draft references it, emit nothing.`,
    };

    const messages: Message[] = [
      ...prefix,
      system,
      ...contextBlock,
      userInstruction,
    ];

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 400,
        temperature: 0.6,
        min_p: 0.05,
      }),
    };
  };

  return {
    requestId: `forge-cleanup-${chat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeCleanup",
      chatId: chat.id,
      messageId: assistantMessageId,
      discardedName,
    },
    prefillBehavior: "trim",
    assistantPrefill: "[",
  };
}
