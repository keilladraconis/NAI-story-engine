import { IDS } from "../../../../ui/framework/ids";
import { messageUpdated } from "../../index";
import {
  GenerationHandlers,
  BrainstormTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

export const brainstormHandler: GenerationHandlers<BrainstormTarget> = {
  streaming(ctx: StreamingContext<BrainstormTarget>, _newText: string): void {
    const uiId = IDS.BRAINSTORM.message(ctx.target.messageId).TEXT;
    api.v1.ui.updateParts([{ id: uiId, text: ctx.accumulatedText }]);
  },

  async completion(ctx: CompletionContext<BrainstormTarget>): Promise<void> {
    if (ctx.accumulatedText) {
      ctx.dispatch(
        messageUpdated({
          id: ctx.target.messageId,
          content: ctx.accumulatedText,
        }),
      );
    }
  },
};
