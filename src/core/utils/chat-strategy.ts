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

// Plain-text prefill for a refine field in Xialong mode. Using a text anchor
// ("Style description:\n\n") directly shows Xialong the start of the expected
// output format, bypassing the [ Style: ] mode-tag system. Only the style
// field needs one; other fields rely on the system prompt + context alone.
function xialongRefinePrefill(fieldId: string): string | undefined {
  if (fieldId === "style") return "Style description:\n\n";
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
    const prefill = xialong ? xialongRefinePrefill(fieldId) : undefined;
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
        if (prefill) {
          messages.push({ role: "assistant", content: prefill });
        }
        return {
          messages,
          params: await buildModelParams({
            max_tokens: 400,
            temperature: 0.7,
            min_p: 0.05,
            stop: ["</think>", "\n***", "\n---", "\n[ S", "\n[ Style"],
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
      assistantPrefill: prefill,
      minResponseLength: xialong ? 40 : undefined,
    };
  }

  // Saved-chat path.
  const spec = getChatTypeSpec(chat.type);
  const noopDispatch: AppDispatch = () => {};
  const ctx = { getState, dispatch: noopDispatch };

  const styleBlock = spec.xialongStyleFor?.(chat, ctx);
  const xialong = styleBlock ? await isXialongMode() : false;
  const prefill = xialong && styleBlock
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
        .filter((m) => m.id !== assistantMessageId)
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
    prefillBehavior: "trim",
    assistantPrefill: prefill,
    minResponseLength: xialong ? 40 : undefined,
  };
}
