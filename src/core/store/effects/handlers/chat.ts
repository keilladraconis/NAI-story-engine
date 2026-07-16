import { messageUpdated, refineCandidateMarked } from "../../slices/chat";
import {
  stripThinkingTags,
  stripStyleBrackets,
} from "../../../utils/tag-parser";
import { appendStream, clearStream } from "../../stream-buffer";
import {
  GenerationHandlers,
  ChatTarget,
  ChatRefineTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

// Streaming text goes to the effect-free stream-buffer keyed by message id, NOT
// through per-token store dispatch: dispatching every chunk runs the whole
// effects pipeline and wedges the JSX panel's render flush. The bubble reads the
// live buffer while it streams. On completion we commit the think-stripped text
// to the store once, then clear the buffer so the bubble falls back to the
// committed value (mid-stream may briefly show <think> tags before cleanup).

export const chatHandler: GenerationHandlers<ChatTarget> = {
  streaming(ctx: StreamingContext<ChatTarget>, newText: string): void {
    appendStream(ctx.target.messageId, newText);
  },

  async completion(ctx: CompletionContext<ChatTarget>): Promise<void> {
    if (ctx.accumulatedText) {
      ctx.dispatch(
        messageUpdated({
          chatId: ctx.target.chatId,
          id: ctx.target.messageId,
          content: stripThinkingTags(ctx.accumulatedText),
        }),
      );
    }
    clearStream(ctx.target.messageId);
  },
};

export const chatRefineHandler: GenerationHandlers<ChatRefineTarget> = {
  streaming(ctx: StreamingContext<ChatRefineTarget>, newText: string): void {
    appendStream(ctx.target.messageId, newText);
  },

  async completion(ctx: CompletionContext<ChatRefineTarget>): Promise<void> {
    if (ctx.accumulatedText) {
      let cleaned = stripThinkingTags(ctx.accumulatedText);
      if (ctx.target.fieldId === "style") {
        cleaned = stripStyleBrackets(cleaned);
      }
      ctx.dispatch(
        messageUpdated({
          chatId: ctx.target.chatId,
          id: ctx.target.messageId,
          content: cleaned,
        }),
      );
      ctx.dispatch(
        refineCandidateMarked({
          chatId: ctx.target.chatId,
          messageId: ctx.target.messageId,
        }),
      );
    }
    clearStream(ctx.target.messageId);
  },
};
