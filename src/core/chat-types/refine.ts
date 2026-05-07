import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx, RefineTarget } from "./types";
import { REFINE_SYSTEM_PROMPT } from "../utils/prompts";
import { attgUpdated, styleUpdated, intentUpdated, contractUpdated } from "../store/slices/foundation";
import { parseContract } from "../store/effects/handlers/foundation";

/**
 * Per-field commit dispatchers — applied when a refine session is committed.
 * Fields backed by the field-strategy registry (attg, style, intent, contract,
 * lorebookContent) can be refined end-to-end. lorebookKeys is intentionally
 * omitted — keys are short comma-separated tokens, refining them through a
 * chat is overkill versus typing them directly.
 */
const FIELD_COMMIT_DISPATCHERS: Record<
  string,
  (text: string, ctx: SpecCtx, target: RefineTarget) => void
> = {
  attg: (text, { dispatch }, _target) => dispatch(attgUpdated({ attg: text })),
  style: (text, { dispatch }, _target) => dispatch(styleUpdated({ style: text })),
  intent: (text, { dispatch }, _target) => dispatch(intentUpdated({ intent: text })),
  contract: (text, { dispatch }, _target) => {
    const parsed = parseContract(text);
    dispatch(contractUpdated({ contract: parsed }));
  },
  lorebookContent: (text, _ctx, target) => {
    if (!target.entryId) return;
    void api.v1.lorebook.updateEntry(target.entryId, { text });
  },
};

export const refineSpec: ChatTypeSpec = {
  id: "refine",
  displayName: "Refine",
  lifecycle: "commit-discard",

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
    const fieldId = seed.kind === "fromField" ? seed.sourceFieldId : "field";
    const sourceText = seed.kind === "fromField" ? seed.sourceText : "";
    const initialMessages: ChatMessage[] = sourceText.trim()
      ? [{ id: api.v1.uuid(), role: "system", content: sourceText }]
      : [];
    return { title: `Refining: ${fieldId}`, initialMessages };
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

    dispatcher(candidate.content, ctx, chat.refineTarget);
  },
};
