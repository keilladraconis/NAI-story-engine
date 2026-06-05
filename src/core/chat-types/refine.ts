import type {
  ChatTypeSpec,
  Chat,
  ChatMessage,
  ChatSeed,
  SpecCtx,
  RefineTarget,
} from "./types";
import { REFINE_SYSTEM_PROMPT } from "../utils/prompts";
import {
  attgUpdated,
  styleUpdated,
  intentUpdated,
  contractUpdated,
} from "../store/slices/foundation";
import { messageAdded, messageRemoved } from "../store/slices/chat";
import { uiChatRefineGenerateRequested } from "../store/slices/ui";
import { parseContract } from "../store/effects/handlers/foundation";
import { IDS } from "../../ui/framework/ids";

/** True while a refine generation for this chat is queued or in flight. */
function refinePending(ctx: SpecCtx): boolean {
  const rt = ctx.getState().runtime;
  return (
    rt.activeRequest?.type === "chatRefine" ||
    rt.queue.some((r) => r.type === "chatRefine")
  );
}

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
  style: (text, { dispatch }, _target) =>
    dispatch(styleUpdated({ style: text })),
  intent: (text, { dispatch }, _target) =>
    dispatch(intentUpdated({ intent: text })),
  contract: (text, { dispatch }, _target) => {
    const parsed = parseContract(text);
    dispatch(contractUpdated({ contract: parsed }));
  },
  lorebookContent: (text, _ctx, target) => {
    if (!target.entryId) return;
    // Sync the visible edit-pane draft so the textarea reflects the refined
    // content. Both lorebook panes (per-entity and standalone) bind their
    // textarea to the same shared CONTENT_DRAFT_KEY in storyStorage. Without
    // this write, the entity edit pane's Save button would later clobber the
    // refined lorebook entry with the stale textarea content.
    void api.v1.storyStorage.set(IDS.LOREBOOK.CONTENT_DRAFT_KEY, text);
    void api.v1.lorebook.updateEntry(target.entryId, { text });
  },
};

export const refineSpec: ChatTypeSpec = {
  id: "refine",
  displayName: "Refine",
  lifecycle: "commit-discard",

  // Type to describe a change (rewrites the seeded snapshot), or send empty /
  // hit Clear to regenerate the field from scratch. Deleting the seeded
  // snapshot message switches every send to a fresh generation.
  inputPlaceholder: "Describe a change, or send empty to regenerate…",
  sendLabel: "Send",
  showClearButton: true,

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
    const fieldId = seed.kind === "fromField" ? seed.sourceFieldId : "field";
    const sourceText = seed.kind === "fromField" ? seed.sourceText : "";
    const initialMessages: ChatMessage[] = sourceText.trim()
      ? [
          {
            id: api.v1.uuid(),
            role: "system",
            content: sourceText,
            messageKind: "refineSource",
          },
        ]
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
    // Back (leave to the Story Engine tab, keep the refine alive) + Sessions
    // (switch to another chat) — like other chat types. The "Refining: <field>"
    // title renders automatically in the header.
    return [
      { id: "back", kind: "backButton" },
      { id: "sessions", kind: "sessionsButton" },
    ];
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

  // Every send produces a fresh assistant candidate (never a continuation): add
  // the typed instruction as a user turn (if any), then run a refine generation.
  // The strategy decides rewrite-vs-fresh from the seeded snapshot's presence.
  handleSend(chat: Chat, content: string, ctx: SpecCtx): boolean {
    if (refinePending(ctx)) return true;
    const trimmed = content.trim();
    if (trimmed) {
      ctx.dispatch(
        messageAdded({
          chatId: chat.id,
          message: { id: api.v1.uuid(), role: "user", content: trimmed },
        }),
      );
    }
    ctx.dispatch(uiChatRefineGenerateRequested({ chatId: chat.id }));
    return true;
  },

  // Clear = "start over from scratch": drop the seeded snapshot and any prior
  // candidates, then run a fresh, unguided generation.
  onClear(chat: Chat, ctx: SpecCtx) {
    if (refinePending(ctx)) return;
    for (const m of chat.messages) {
      ctx.dispatch(messageRemoved({ chatId: chat.id, id: m.id }));
    }
    ctx.dispatch(uiChatRefineGenerateRequested({ chatId: chat.id }));
  },
};
