import type { Chat } from "../chat-types/types";
import type { GenerationStrategy, RootState, AppDispatch } from "../store/types";
import { getChatTypeSpec } from "../chat-types";
import { getFieldStrategy } from "./field-strategy-registry";
import { buildStoryEnginePrefix } from "./context-builder";
import { isXialongMode } from "./config";

/**
 * Builds the GenerationStrategy for a chat-driven generation.
 *
 * For refine chats, delegates to the field strategy registered for
 * `chat.refineTarget.fieldId` with a `refineContext` injected — the field
 * strategy already knows how to weave the refine tail (system prompt + target
 * snapshot + chat history) onto its own messages. The returned strategy
 * preserves the field strategy's `messageFactory`, params and prefill, but
 * rewrites `requestId` and `target` so completion routes back to the chat.
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
    const factory = getFieldStrategy(chat.refineTarget.fieldId);
    const inner = factory(getState, {
      refineContext: {
        fieldId: chat.refineTarget.fieldId,
        currentText: chat.refineTarget.originalText,
        history: chat.messages,
      },
      entryId: chat.refineTarget.entryId,
    });
    return {
      ...inner,
      requestId: `refine-${chat.id}-${assistantMessageId}`,
      target: {
        type: "chatRefine",
        chatId: chat.id,
        messageId: assistantMessageId,
        fieldId: chat.refineTarget.fieldId,
      },
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
      return { messages };
    },
    target: { type: "chat", chatId: chat.id, messageId: assistantMessageId },
    prefillBehavior: "trim",
    assistantPrefill: prefill,
  };
}
