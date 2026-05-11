import {
  messageAppended,
  messageUpdated,
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

// Per-chunk dispatches grow the message in state; SeMessage's liveSelector
// picks up the change and updates the bubble's view text reactively. On
// completion we replace the accumulated content with the think-stripped
// version (mid-stream may briefly show <think> tags before they're cleaned).

export const chatHandler: GenerationHandlers<ChatTarget> = {
  streaming(ctx: StreamingContext<ChatTarget>, newText: string): void {
    ctx.dispatch(
      messageAppended({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: newText,
      }),
    );
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
  streaming(ctx: StreamingContext<ChatRefineTarget>, newText: string): void {
    ctx.dispatch(
      messageAppended({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: newText,
      }),
    );
  },

  async completion(ctx: CompletionContext<ChatRefineTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;
    const cleaned = stripThinkingTags(ctx.accumulatedText);
    ctx.dispatch(
      messageUpdated({
        chatId: ctx.target.chatId,
        id: ctx.target.messageId,
        content: cleaned,
      }),
    );
    ctx.dispatch(
      refineCandidateMarked({ messageId: ctx.target.messageId }),
    );
  },
};
