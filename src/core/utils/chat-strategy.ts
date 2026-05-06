import type { Chat } from "../chat-types/types";
import type { GenerationStrategy, RootState, AppDispatch } from "../store/types";
import { getChatTypeSpec } from "../chat-types";
import { getFieldStrategy } from "./field-strategy-registry";
import { buildStoryEnginePrefix } from "./context-builder";

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
export function buildChatStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
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
        messageId: assistantMessageId,
        fieldId: chat.refineTarget.fieldId,
      },
    };
  }

  // Saved-chat path. systemPromptFor / prefillFor on the current specs only
  // read from `chat` (not from ctx), so a no-op dispatch is safe to pass.
  // When a future spec actually dispatches inside these hooks, switch this
  // callsite to thread the real dispatch through.
  const spec = getChatTypeSpec(chat.type);
  const noopDispatch: AppDispatch = () => {};
  const ctx = { getState, dispatch: noopDispatch };
  return {
    requestId: `chat-${chat.id}-${assistantMessageId}`,
    messageFactory: async () => {
      // excludeChat: we'll inject the chat's own transcript below
      const prefix = await buildStoryEnginePrefix(getState, { excludeChat: true });
      const system: Message = {
        role: "system",
        content: spec.systemPromptFor(chat, ctx),
      };
      const transcript: Message[] = chat.messages
        .filter((m) => m.id !== assistantMessageId)
        .map((m) => ({ role: m.role, content: m.content }));
      return {
        messages: [...prefix, system, ...transcript],
      };
    },
    target: { type: "chat", chatId: chat.id, messageId: assistantMessageId },
    prefillBehavior: "trim",
    assistantPrefill: spec.prefillFor?.(chat, ctx),
  };
}
