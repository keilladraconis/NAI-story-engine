import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import { REFINE_SYSTEM_PROMPT } from "../utils/prompts";
import { attgUpdated, styleUpdated } from "../store/slices/foundation";

/**
 * Per-field commit dispatchers — applied when a refine session is committed.
 * Only fields backed by the field-strategy registry today (attg, style) can
 * be refined end-to-end; expand this map as more fields gain registered
 * strategies (intent / contract / lorebook in later tasks).
 */
const FIELD_COMMIT_DISPATCHERS: Record<
  string,
  (text: string, ctx: SpecCtx) => void
> = {
  attg: (text, { dispatch }) => dispatch(attgUpdated({ attg: text })),
  style: (text, { dispatch }) => dispatch(styleUpdated({ style: text })),
};

export const refineSpec: ChatTypeSpec = {
  id: "refine",
  displayName: "Refine",
  lifecycle: "commit-discard",

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
    const fieldId = seed.kind === "fromField" ? seed.sourceFieldId : "field";
    return { title: `Refining: ${fieldId}`, initialMessages: [] };
  },

  systemPromptFor(_chat: Chat, _ctx: SpecCtx): string {
    return REFINE_SYSTEM_PROMPT;
  },

  contextSlice(_chat: Chat, _ctx: SpecCtx): ChatMessage[] {
    return [];
  },

  headerControls(_chat: Chat, _ctx: SpecCtx) {
    return [{ id: "target", kind: "label" }];
  },

  onCommit(chat: Chat, ctx: SpecCtx) {
    if (!chat.refineTarget) return;

    // Last assistant message with non-empty content is the candidate. Walk
    // from the end so we pick up the freshest rewrite when the user has
    // retried multiple times.
    let candidate: ChatMessage | undefined;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === "assistant" && m.content.trim().length > 0) {
        candidate = m;
        break;
      }
    }
    if (!candidate) return;

    const fieldId = chat.refineTarget.fieldId;
    const dispatcher = FIELD_COMMIT_DISPATCHERS[fieldId];
    if (!dispatcher) {
      api.v1.ui.toast(`Refine commit not yet supported for: ${fieldId}`, {
        type: "warning",
      });
      return;
    }

    dispatcher(candidate.content, ctx);
  },
};
