import { IDS } from "../../../../ui/framework/ids";
import { messageUpdated, chatRenamed } from "../../index";
import { stripThinkingTags } from "../../../utils/tag-parser";
import {
  GenerationHandlers,
  BrainstormTarget,
  BrainstormChatTitleTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

export const brainstormHandler: GenerationHandlers<BrainstormTarget> = {
  streaming(ctx: StreamingContext<BrainstormTarget>, _newText: string): void {
    const viewId = `${IDS.BRAINSTORM.message(ctx.target.messageId).TEXT}-view`;
    api.v1.ui.updateParts([{ id: viewId, text: ctx.accumulatedText }]);
  },

  async completion(ctx: CompletionContext<BrainstormTarget>): Promise<void> {
    if (ctx.accumulatedText) {
      ctx.dispatch(
        messageUpdated({
          id: ctx.target.messageId,
          content: stripThinkingTags(ctx.accumulatedText),
        }),
      );
    }
  },
};

export const brainstormChatTitleHandler: GenerationHandlers<BrainstormChatTitleTarget> =
  {
    streaming(
      _ctx: StreamingContext<BrainstormChatTitleTarget>,
      _newText: string,
    ): void {
      // Title generation streams silently — no intermediate UI update needed
    },

    async completion(
      ctx: CompletionContext<BrainstormChatTitleTarget>,
    ): Promise<void> {
      if (!ctx.generationSucceeded) return;
      const title = ctx.accumulatedText.trim().replace(/[.!?]+$/, "");
      if (title) {
        ctx.dispatch(chatRenamed({ index: ctx.target.chatIndex, title }));
      }
    },
  };
