import {
  messageRemoved,
  messageUpdated,
  refineCandidateMarked,
} from "../../slices/chat";
import {
  stripThinkingTags,
  stripStyleBrackets,
  stripRefineMarkers,
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
    const { chatId, messageId } = ctx.target;
    if (ctx.accumulatedText) {
      ctx.dispatch(
        messageUpdated({
          chatId,
          id: messageId,
          content: stripThinkingTags(ctx.accumulatedText),
        }),
      );
    } else {
      // Cancelled or failed before anything arrived: drop the empty placeholder
      // instead of leaving a blank bubble behind. A message that already has
      // content is a turn being extended, and stays.
      const stored = ctx
        .getState()
        .chat.chats.find((c) => c.id === chatId)
        ?.messages.find((m) => m.id === messageId);
      if (stored && stored.content === "") {
        ctx.dispatch(messageRemoved({ chatId, id: messageId }));
      }
    }
    clearStream(messageId);
  },
};

export const chatRefineHandler: GenerationHandlers<ChatRefineTarget> = {
  streaming(ctx: StreamingContext<ChatRefineTarget>, newText: string): void {
    appendStream(ctx.target.messageId, newText);
  },

  async completion(ctx: CompletionContext<ChatRefineTarget>): Promise<void> {
    if (ctx.accumulatedText) {
      // Order matters: the thinking tags come off first, because a marker can
      // sit inside one, and the refine framing comes off before any per-field
      // cleanup so that cleanup sees the field and not the scaffolding.
      let cleaned = stripRefineMarkers(stripThinkingTags(ctx.accumulatedText));
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
