/**
 * Scenario turn strategy — the per-turn message factory for the Scenario chat.
 *
 * Two kinds of turn share one chat. A Plan turn is a conversation: the Plan
 * prompt, the Foundation and Setting, what is built so far, and the transcript;
 * it targets the ordinary chat handler and applies nothing. A Build turn is the
 * Build prompt, the same premise, a context block code computes fresh each turn
 * ([WORLD], [THREADS], [REJECTED LAST TURN]), then the
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
import { formatFoundationBlock, formatSettingBlock } from "./context-builder";
import { buildModelParams, isXialongMode } from "./config";
import {
  parseCommands,
  serializeForgeCommand,
} from "./crucible-command-parser";
import {
  buildScenarioBuildPrompt,
  buildScenarioPlanPrompt,
  normalizeRegisterKey,
  SCENARIO_BUILD_INSTRUCTION,
  SCENARIO_BUILD_PREFILL,
  XIALONG_STYLE,
} from "./prompts";
import { DULFS_CATEGORY_LABELS } from "./category-detect";

/** The conversation as the Scenario model should see it: the chat's messages
 *  without the placeholder about to be filled and without anything
 *  empty. An undone Build reply is left out: what it built no longer exists. */
function conversation(
  messages: ChatMessage[],
  placeholderId?: string,
): ChatMessage[] {
  return messages.filter(
    (m) => m.id !== placeholderId && !m.undone && m.content.trim() !== "",
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
  const mark = e.sourceChatId ? "* " : "";
  return `- ${mark}${e.name} (${label})${e.summary ? ` — ${e.summary}` : ""}`;
}

/** Everything in the World. Build may revise or rename any of it, and delete
 *  only what a Scenario chat built, which the star marks. */
export function formatWorld(state: RootState): string {
  const all = state.world.entityIds
    .map((id) => state.world.entitiesById[id])
    .filter((e): e is WorldEntity => !!e);
  if (all.length === 0) return "";
  return [
    "[WORLD] (* = built here; only these may be deleted)",
    ...all.map(formatEntityLine),
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
    // The chat as it stands now: a message pruned while it waited changed it after the strategy was built.
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
        formatWorld(state),
        formatThreads(state),
        formatRejections(prior),
      ]),
      ...scenarioConversation(chat.messages, assistantMessageId),
      ...(directs
        ? []
        : [{ role: "user" as const, content: SCENARIO_BUILD_INSTRUCTION }]),
      { role: "assistant", content: SCENARIO_BUILD_PREFILL },
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
    // The reply is started on its thinking and keeps that opening word.
    prefillBehavior: "keep",
    assistantPrefill: SCENARIO_BUILD_PREFILL,
    // Cut off by the token cap it stops mid-command and the last action is
    // lost, so it continues.
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
      ...contextBlock([formatWorld(state), formatThreads(state)]),
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
