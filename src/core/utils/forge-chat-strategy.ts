/**
 * Scenario turn strategy — the per-turn message factory for the Scenario chat,
 * plus the post-discard reference scrubber.
 *
 * Two kinds of turn share one chat. A Plan turn is a conversation: the Plan
 * prompt, the Foundation and Setting, what is built so far, and the transcript;
 * it targets the ordinary chat handler and applies nothing. A Build turn is the
 * Build prompt, the same premise, a context block code computes fresh each turn
 * ([POOL], [LIVE], [THREADS], [TOMBSTONES], [REJECTED LAST TURN]), then the
 * transcript; its reply is thinking and commands. Neither turn is shown the
 * thinking of an earlier Build reply (`scenarioConversation`).
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
import { buildModelParams, isXialongMode } from "./config";
import {
  parseCommands,
  serializeForgeCommand,
} from "./crucible-command-parser";
import {
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
  normalizeRegisterKey,
  FORGE_CLEANUP_PROMPT,
  SCENARIO_BUILD_INSTRUCTION,
  XIALONG_STYLE,
} from "./prompts";
import { DULFS_CATEGORY_LABELS } from "./category-detect";

/** The conversation as the Scenario model should see it: the chat's messages
 *  without the placeholder about to be filled, without reference scrubs, and
 *  without anything empty. A scrub is bookkeeping queued ahead of a turn, so it
 *  is neither a reply nor the last thing said. */
function conversation(
  messages: ChatMessage[],
  placeholderId?: string,
): ChatMessage[] {
  return messages.filter(
    (m) =>
      m.id !== placeholderId &&
      m.messageKind !== "cleanup" &&
      m.content.trim() !== "",
  );
}

/** The conversation as a later turn is shown it. A Build reply is reduced to
 *  the commands it wrote: its thinking is GLM's reasoning, which should steer
 *  neither the next Build nor the voice Plan answers in. One that wrote no
 *  command has nothing left and is left out. */
export function scenarioConversation(
  messages: ChatMessage[],
  placeholderId?: string,
): Message[] {
  return conversation(messages, placeholderId).flatMap((m) => {
    if (m.role === "assistant" && m.mode === "build") {
      const commands = parseCommands(m.content)
        .map(serializeForgeCommand)
        .join("\n");
      return commands ? [{ role: m.role, content: commands }] : [];
    }
    return [{ role: m.role, content: m.content }];
  });
}

/** The Engine's replies, oldest first. */
function replies(messages: ChatMessage[]): ChatMessage[] {
  return conversation(messages).filter((m) => m.role === "assistant");
}

/** The commands the most recent reply wrote that were not applied, each with
 *  the reason. A rejection the model never sees is one it repeats. */
export function formatRejections(messages: ChatMessage[]): string {
  // The last reply that was read for commands, not the last reply: a Plan
  // reply after a Build has no segments, and the rejection must outlive it.
  // A Build reply counts with or without them: edited or unfinished, it
  // settled nothing, and an older Build's rejections are not "last turn".
  const built = replies(messages).filter(
    (m) => m.mode === "build" || m.forgeSegments,
  );
  const lines = (built[built.length - 1]?.forgeSegments ?? []).flatMap((s) => {
    if (s.kind !== "action" || s.action.status === "applied") return [];
    const { kind, name, reason } = s.action;
    return [
      kind === "UNKNOWN"
        ? `- ${reason ?? "unrecognized command"}`
        : `- ${kind}${name ? ` "${name}"` : ""}: ${reason ?? "rejected"}`,
    ];
  });
  if (lines.length === 0) return "";
  return ["[REJECTED LAST TURN] (not applied)", ...lines].join("\n");
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

async function premiseOf(state: RootState): Promise<Message[]> {
  const premise = [formatFoundationBlock(state), await formatSettingBlock()]
    .filter((b) => b.length > 0)
    .join("\n\n");
  return premise ? [{ role: "system", content: premise }] : [];
}

function contextBlock(blocks: string[]): Message[] {
  const present = blocks.filter((b) => b.length > 0);
  return present.length > 0
    ? [{ role: "assistant", content: present.join("\n\n") }]
    : [];
}

export function buildScenarioBuildStrategy(
  getState: () => RootState,
  queuedChat: Chat,
  assistantMessageId: string,
  directed?: boolean,
): GenerationStrategy {
  const factory = async () => {
    const state = getState();
    // The chat as it stands now: a scrub queued ahead of this turn, or a
    // message pruned while it waited, changed it after the strategy was built.
    const chat =
      state.chat.chats.find((c) => c.id === queuedChat.id) ?? queuedChat;
    const prior = conversation(chat.messages, assistantMessageId);
    // A typed send directs the build; an empty one stands on the fixed
    // instruction. The send says which. The tail cannot: after a failed Plan
    // turn it is the writer's own Plan message, which directed nothing. Only
    // a retry, which carries no send, is read from the tail.
    const directs = directed ?? prior[prior.length - 1]?.role === "user";

    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioBuildPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(await premiseOf(state)),
      // No truncation anywhere in this block: a summary cut short is a draft
      // the model revises from half its text.
      ...contextBlock([
        formatPool(state, chat.id),
        formatLive(state),
        formatThreads(state),
        formatTombstones(state, chat.id),
        formatRejections(prior),
      ]),
      ...scenarioConversation(chat.messages, assistantMessageId),
      ...(directs
        ? []
        : [{ role: "user" as const, content: SCENARIO_BUILD_INSTRUCTION }]),
    ];

    return {
      messages,
      // "instruct": a Build turn emits a strict bracket grammar, and every
      // command that misses it is an entry the writer does not get.
      // 1024 per call, not the whole 2048 bucket: a generation is refused
      // until the bucket holds max_tokens, and the continuation below carries
      // a reply that runs past one call.
      params: await buildModelParams(
        { max_tokens: 1024, temperature: 0.9, min_p: 0.05 },
        "instruct",
      ),
    };
  };

  return {
    requestId: `scenario-${queuedChat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "forgeChat",
      chatId: queuedChat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    // No prefill: a reply opens with thinking. Cut off by the token cap it
    // stops mid-command and the last action is lost, so it continues.
    continuation: { maxCalls: 4 },
  };
}

/** A Plan turn: a conversation on the creative model. It targets the ordinary
 *  chat handler, which commits the text and never reads it for commands.
 *
 *  Built without waiting on anything, so the effect can add the placeholder
 *  and queue the request in the turn it was asked in. The creative model is
 *  read by the factory instead: the engine takes a trimmed prefill from the
 *  messages (the continuation folds the trailing assistant message in), never
 *  from the strategy. */
export function buildScenarioPlanStrategy(
  getState: () => RootState,
  queuedChat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  const factory = async () => {
    const xialong = await isXialongMode();
    const state = getState();
    const chat =
      state.chat.chats.find((c) => c.id === queuedChat.id) ?? queuedChat;
    const messages: Message[] = [
      {
        role: "system",
        content: buildScenarioPlanPrompt(
          normalizeRegisterKey(state.foundation.intensity?.level),
        ),
      },
      ...(await premiseOf(state)),
      ...contextBlock([
        formatPool(state, chat.id),
        formatLive(state),
        formatThreads(state),
      ]),
      ...scenarioConversation(chat.messages, assistantMessageId),
      ...(xialong
        ? [{ role: "assistant" as const, content: XIALONG_STYLE.scenarioPlan }]
        : []),
    ];
    return {
      messages,
      // Small first call so it clears the token bucket; the continuation
      // below extends a reply that runs long.
      params: await buildModelParams({
        max_tokens: 512,
        temperature: 1.0,
        ...(xialong ? { stop: ["</think>", "\n[ Style"] } : {}),
      }),
    };
  };

  return {
    requestId: `chat-${queuedChat.id}-${assistantMessageId}`,
    messageFactory: factory,
    target: {
      type: "chat",
      chatId: queuedChat.id,
      messageId: assistantMessageId,
    },
    prefillBehavior: "trim",
    // Xialong sometimes returns an empty think block and nothing else; a
    // reply under this floor is re-rolled. "Cut the prologue." is a real one.
    // On either model: no reply this short is one.
    minResponseLength: 4,
    continuation: { maxCalls: 5 },
  };
}

export function buildForgeCleanupStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
  discardedNames: string[],
): GenerationStrategy {
  const factory = async () => {
    const prefix = await buildStoryEnginePrefix(getState);
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
    // Cut off by the token cap, a scrub stops mid-command: the bracket never
    // closes and the last REVISE is lost, so it continues. The engine folds
    // the "[" prefill into the continuation turn, so the model resumes from
    // all it has written.
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
