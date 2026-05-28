import type { Chat } from "../chat-types/types";
import type { GenerationStrategy, RootState, AppDispatch } from "../store/types";
import { getChatTypeSpec } from "../chat-types";
import { buildStoryEnginePrefix, type StoryEnginePrefixOptions } from "./context-builder";
import { isXialongMode, buildModelParams } from "./config";
import { buildRefineTail } from "./refine-strategy";

// Returns sections to omit from buildStoryEnginePrefix so the field being
// refined is not present in context above ----, avoiding double-injection.
function excludeSectionsForRefine(fieldId: string): StoryEnginePrefixOptions["excludeSections"] {
  if (fieldId === "style") return ["style"];
  if (fieldId === "attg") return ["attg"];
  return undefined;
}

/**
 * Builds the GenerationStrategy for a chat-driven generation.
 *
 * For refine chats, assembles context from scratch: the unified Story Engine
 * prefix (story context, foundation data — no field-generation directives),
 * a ---- boundary, REFINE_SYSTEM_PROMPT, the target snapshot, and the
 * chat history. This mirrors the saved-chat path and avoids the field
 * factory's generation-prompt context, which caused Xialong to treat refine
 * as a fresh generate rather than a rewrite.
 *
 * For saved chats (brainstorm, summary), assembles a fresh strategy: the
 * unified Story Engine prefix, the chat's system prompt, the transcript
 * (excluding the placeholder assistant message we are about to fill), and
 * an optional assistant prefill from the spec.
 */
export async function buildChatStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): Promise<GenerationStrategy> {
  if (chat.type === "refine" && chat.refineTarget) {
    const { fieldId, originalText } = chat.refineTarget;
    const filteredHistory = chat.messages.filter((m) => m.id !== assistantMessageId);
    const xialong = await isXialongMode();
    const excludeSections = excludeSectionsForRefine(fieldId);

    return {
      requestId: `refine-${chat.id}-${assistantMessageId}`,
      messageFactory: async () => {
        const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true, excludeSections });
        const messages = buildRefineTail(prefix, {
          fieldId,
          currentText: originalText,
          history: filteredHistory,
        });
        return {
          messages,
          params: await buildModelParams({
            max_tokens: 400,
            temperature: 0.7,
            min_p: 0.05,
            stop: ["</think>", "\n***", "\n---", "---", "]\n"],
          }),
        };
      },
      target: {
        type: "chatRefine",
        chatId: chat.id,
        messageId: assistantMessageId,
        fieldId,
      },
      prefillBehavior: "trim" as const,
      minResponseLength: xialong ? 40 : undefined,
    };
  }

  // Saved-chat path.
  const spec = getChatTypeSpec(chat.type);
  const noopDispatch: AppDispatch = () => {};
  const ctx = { getState, dispatch: noopDispatch };

  // Manual continuation: target points at an existing assistant message that
  // already has content. Keep it as the tail of the transcript (the model
  // will continue from there), skip the fresh spec prefill, and tell the
  // engine to seed accumulatedText with the existing content via "keep".
  const targetMsg = chat.messages.find((m) => m.id === assistantMessageId);
  const isContinuation =
    !!targetMsg && targetMsg.role === "assistant" && targetMsg.content.length > 0;

  const styleBlock = spec.xialongStyleFor?.(chat, ctx);
  const xialong = styleBlock ? await isXialongMode() : false;
  const prefill = isContinuation
    ? undefined
    : xialong && styleBlock
      ? styleBlock
      : spec.prefillFor?.(chat, ctx);

  return {
    requestId: `chat-${chat.id}-${assistantMessageId}`,
    messageFactory: async () => {
      const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true });
      const system: Message = {
        role: "system",
        content: spec.systemPromptFor(chat, ctx),
      };
      const transcript: Message[] = chat.messages
        .filter((m) => isContinuation || m.id !== assistantMessageId)
        .map((m) => ({ role: m.role, content: m.content }));
      const messages = [...prefix];
      messages.push({ role: "system", content: "----" });
      messages.push(system, ...transcript);
      if (prefill) {
        messages.push({ role: "assistant", content: prefill });
      }
      const params = xialong
        ? { stop: ["</think>", "\n[ Style"] }
        : undefined;
      return { messages, params };
    },
    target: { type: "chat", chatId: chat.id, messageId: assistantMessageId },
    prefillBehavior: isContinuation ? "keep" : "trim",
    assistantPrefill: prefill,
    // Skip the short-response retry for continuations — its reset path clears
    // the visible message and would erase the original turn we're extending.
    minResponseLength: isContinuation ? undefined : xialong ? 40 : undefined,
  };
}
