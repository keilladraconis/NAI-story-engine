import type { Chat } from "../chat-types/types";
import type { GenerationStrategy, RootState, AppDispatch } from "../store/types";
import { getChatTypeSpec } from "../chat-types";
import { buildStoryEnginePrefix, buildXialongNarrativeStyleBlock, type StoryEnginePrefixOptions } from "./context-builder";
import { isXialongMode, buildModelParams } from "./config";
import { buildRefineTail } from "./refine-strategy";
import { XIALONG_STYLE } from "./prompts";
import { isDulfsField } from "../../config/field-definitions";

// Returns the XIALONG_STYLE entry that governs Xialong output for a given
// refine field — the same analytical mode the field uses for generation.
function xialongStyleForRefine(fieldId: string): string {
  if (fieldId === "attg") return XIALONG_STYLE.attg;
  if (fieldId === "intent") return XIALONG_STYLE.foundationIntent;
  if (fieldId === "contract") return XIALONG_STYLE.foundationContract;
  if (isDulfsField(fieldId)) return XIALONG_STYLE.lorebookRefine;
  return XIALONG_STYLE.lorebookRefine;
}

// Returns sections to omit from buildStoryEnginePrefix so the field being
// refined is not present in context above ----, avoiding double-injection
// and the prose-mode signals that come from analytical style text.
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
    // Style field: use the same narrative style block as generation
    // (threshold-crossing, psychological, etc.) so Xialong produces a
    // style description rather than literary criticism.
    const prefill = xialong
      ? fieldId === "style"
        ? buildXialongNarrativeStyleBlock(getState())
        : xialongStyleForRefine(fieldId)
      : undefined;
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
