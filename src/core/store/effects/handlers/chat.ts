import {
  messageUpdated,
  refineMessageReplaced,
  refineCandidateMarked,
} from "../../slices/chat";
import { stripThinkingTags } from "../../../utils/tag-parser";
import {
  GenerationHandlers,
  ChatTarget,
  ChatRefineTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

// Streaming is intentionally a no-op until Task 18+ wires the chat panel UI:
// StreamingContext lacks a `dispatch`, the chat panel is store-driven (no
// `api.v1.ui.updateParts` target exists yet), so per-chunk updates are
// deferred. Completion dispatches the full cleaned content.

export const chatHandler: GenerationHandlers<ChatTarget> = {
  streaming(_ctx: StreamingContext<ChatTarget>, _newText: string): void {
    // No-op: see file-level comment.
  },

  async completion(ctx: CompletionContext<ChatTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;
    ctx.dispatch(
      messageUpdated({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: stripThinkingTags(ctx.accumulatedText),
      }),
    );
  },
};

export const chatRefineHandler: GenerationHandlers<ChatRefineTarget> = {
  streaming(
    _ctx: StreamingContext<ChatRefineTarget>,
    _newText: string,
  ): void {
    // No-op: see file-level comment.
  },

  async completion(ctx: CompletionContext<ChatRefineTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;
    const cleaned = stripThinkingTags(ctx.accumulatedText);
    ctx.dispatch(
      refineMessageReplaced({ id: ctx.target.messageId, content: cleaned }),
    );
    ctx.dispatch(
      refineCandidateMarked({ messageId: ctx.target.messageId }),
    );
  },
};
