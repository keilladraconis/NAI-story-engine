/**
 * Scenario turn strategy — the per-turn message factory for the Scenario chat,
 * plus the post-discard reference scrubber.
 *
 * A turn is: the Scenario system prompt (with the register), the Foundation
 * and Setting, a context block code computes fresh each turn (TURN, [POOL],
 * [LIVE], [THREADS], [TOMBSTONES], [REJECTED LAST TURN], [PREVIOUS CRITIQUE]),
 * then the chat's own transcript. Nothing here is frozen at session start: the
 * chat is long-lived and the Foundation changes under it.
 *
 * [THREADS] carries title, cast and state only. A Thread's private halves reach
 * this model the one way they may: as the commands in its own transcript.
 */

import type { Chat, ChatMessage } from "../chat-types/types";
import type {
  GenerationStrategy,
  RootState,
  WorldEntity,
} from "../store/types";
import {
  buildStoryEnginePrefix,
  formatFoundationBlock,
  formatSettingBlock,
} from "./context-builder";
import { buildModelParams } from "./config";
import {
  buildScenarioPrompt,
  normalizeRegisterKey,
  FORGE_CLEANUP_PROMPT,
  SCENARIO_GROW_INSTRUCTION,
} from "./prompts";
import { DULFS_CATEGORY_LABELS } from "./category-detect";
import { parseCommands } from "./crucible-command-parser";

export type ScenarioTurn = "sketch" | "steer" | "grow";

/** Which kind of turn the placeholder `assistantMessageId` is about to hold.
 *  Read from the transcript, so a retry after a prune asks the right thing. */
export function scenarioTurn(
  chat: Chat,
  assistantMessageId: string,
): ScenarioTurn {
  const prior = chat.messages.filter((m) => m.id !== assistantMessageId);
  const answered = prior.some(
    (m) => m.role === "assistant" && m.content.trim() !== "",
  );
  if (!answered) return "sketch";
  return prior[prior.length - 1]?.role === "user" ? "steer" : "grow";
}

function lastReply(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.trim() !== "") return m;
  }
  return undefined;
}

/** The critique in the most recent reply, or null. Parsed with the command
 *  parser, so it is found wherever in the reply it sits. */
export function extractLastCritique(messages: ChatMessage[]): string | null {
  const reply = lastReply(messages);
  if (!reply) return null;
  const critiques = parseCommands(reply.content).filter(
    (c) => c.kind === "CRITIQUE",
  );
  const last = critiques[critiques.length - 1];
  return last?.kind === "CRITIQUE" ? last.text : null;
}

/** The commands the most recent reply wrote that were not applied, each with
 *  the reason. A rejection the model never sees is one it repeats. */
export function formatRejections(messages: ChatMessage[]): string {
  const lines = (lastReply(messages)?.forgeSegments ?? []).flatMap((s) => {
    if (s.kind !== "action" || s.action.status === "applied") return [];
    const { kind, name, reason } = s.action;
    return [
      kind === "UNKNOWN"
        ? `- ${reason ?? "unrecognized command"}`
        : `- ${kind}${name ? ` "${name}"` : ""}: ${reason ?? "rejected"}`,
    ];
  });
  if (lines.length === 0) return "";
  return [
    "[REJECTED LAST TURN] (not applied; write each again as its repair says)",
    ...lines,
  ].join("\n");
}

// --- Context block formatters ---

function formatEntityLine(e: WorldEntity): string {
  const label = DULFS_CATEGORY_LABELS[e.categoryId] ?? "Entity";
  return `- ${e.name} (${label})${e.summary ? ` — ${e.summary}` : ""}`;
}

function formatPool(state: RootState, chatId: string): string {
  const drafts = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  );
  if (drafts.length === 0) return "";
  return [
    "[POOL] (drafts you may modify)",
    ...drafts.map(formatEntityLine),
  ].join("\n");
}

function formatLive(state: RootState): string {
  const live = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "live",
  );
  if (live.length === 0) return "";
  return [
    "[LIVE] (read-only; never modify or delete)",
    ...live.map(formatEntityLine),
  ].join("\n");
}

function formatThreads(state: RootState): string {
  const open = state.world.threads.filter((t) => t.status === "open");
  if (open.length === 0) return "";
  const lines = open.map((t) => {
    const cast = t.entityIds
      .map((id) => state.world.entitiesById[id]?.name)
      .filter((n): n is string => !!n)
      .join(", ");
    return `- ${t.title} | ${cast} | ${t.state.trim() || "(blank)"}`;
  });
  return ["[THREADS] (title | cast | state)", ...lines].join("\n");
}

function formatTombstones(state: RootState, chatId: string): string {
  const tombs = state.forge.tombstonesByChatId[chatId] ?? [];
  if (tombs.length === 0) return "";
  return [
    "[TOMBSTONES] (discarded; do not recreate)",
    ...tombs.map((t) => `- ${t.name} (${t.category})`),
  ].join("\n");
}

// --- Strategies ---

export function buildScenarioTurnStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  const factory = async () => {
    const state = getState();
    const turn = scenarioTurn(chat, assistantMessageId);
    const prior = chat.messages.filter((m) => m.id !== assistantMessageId);

    const premise = [formatFoundationBlock(state), await formatSettingBlock()]
      .filter((b) => b.length > 0)
      .join("\n\n");

    const critique = extractLastCritique(prior);
    // No truncation anywhere in this block: a summary cut short is a draft the
    // model revises from half its text.
    const blocks = [
      `TURN: ${turn.toUpperCase()}`,
      formatPool(state, chat.id),
      formatLive(state),
      formatThreads(state),
      formatTombstones(state, chat.id),
      formatRejections(prior),
      critique ? `[PREVIOUS CRITIQUE]\n${critique}` : "",
    ].filter((b) => b.length > 0);

    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(premise ? [{ role: "system" as const, content: premise }] : []),
      { role: "assistant", content: blocks.join("\n\n") },
      ...prior.map((m) => ({ role: m.role, content: m.content })),
      ...(turn === "grow"
        ? [{ role: "user" as const, content: SCENARIO_GROW_INSTRUCTION }]
        : []),
    ];

    return {
      messages,
      // "instruct": a turn emits a strict bracket grammar, and every command
      // that misses it is a card the writer does not get. Observed the other
      // way round on the Forge: on the creative model a pass answered
      // conversationally and created nothing.
      params: await buildModelParams(
        { max_tokens: 1536, temperature: 0.9, min_p: 0.05 },
        "instruct",
      ),
    };
  };

  return {
    requestId: `scenario-${chat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeChat",
      chatId: chat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    // No prefill: a reply opens with prose. Cut off by the token cap it stops
    // mid-command and the last action is lost, so it continues.
    continuation: { maxCalls: 4 },
  };
}

export function buildForgeCleanupStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
  discardedNames: string[],
): GenerationStrategy {
  const factory = async () => {
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeChat: true,
    });
    const state = getState();

    const system: Message = { role: "system", content: FORGE_CLEANUP_PROMPT };

    const pool = formatPool(state, chat.id);
    const contextBlock: Message[] = pool
      ? [{ role: "assistant", content: pool }]
      : [];

    const userInstruction: Message = {
      role: "user",
      content: buildCleanupUserInstruction(discardedNames),
    };

    const messages: Message[] = [
      ...prefix,
      system,
      ...contextBlock,
      userInstruction,
    ];

    return {
      messages,
      params: await buildModelParams(
        {
          max_tokens: 400,
          temperature: 0.6,
          min_p: 0.05,
        },
        "instruct",
      ),
    };
  };

  return {
    requestId: `forge-cleanup-${chat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeCleanup",
      chatId: chat.id,
      messageId: assistantMessageId,
      discardedNames,
    },
    prefillBehavior: "trim",
    assistantPrefill: "[",
    // Cut off by the token cap, a forge turn stops mid-command: the bracket
    // never closes, so the last action is lost and the turn reads as an
    // unfinished thought. Chats and refines have continued since they shipped;
    // the Forge did not, and a sketch emitting six commands is exactly the
    // length that runs out of room. The engine folds the "[" prefill into the
    // continuation turn, so the model resumes from all it has written.
    continuation: { maxCalls: 4 },
  };
}

function buildCleanupUserInstruction(discardedNames: string[]): string {
  if (discardedNames.length === 1) {
    const name = discardedNames[0];
    return `Discarded entity: "${name}". Emit REVISE commands for any draft in the pool that references "${name}" — by name, nickname, partial name, or indirect role-reference. If no draft references it, emit nothing.`;
  }
  const formattedList = discardedNames.map((n) => `"${n}"`).join(", ");
  return `Discarded entities: ${formattedList}. Emit REVISE commands for any draft in the pool that references any of those entities — by name, nickname, partial name, or indirect role-reference. If none reference them, emit nothing.`;
}
