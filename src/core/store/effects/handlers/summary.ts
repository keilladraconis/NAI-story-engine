import { EDIT_PANE_CONTENT } from "../../../../ui/framework/ids";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { GenerationStrategy } from "../../types";
import { entitySummaryUpdated } from "../../index";

type EntitySummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummary" }
>;
type EntitySummaryBindTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummaryBind" }
>;
type ThreadSummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "threadSummary" }
>;

export const entitySummaryHandler: GenerationHandlers<EntitySummaryTarget> = {
  streaming(ctx: StreamingContext<EntitySummaryTarget>, _newText: string): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<EntitySummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      await api.v1.storyStorage.set(
        EDIT_PANE_CONTENT,
        ctx.accumulatedText.trim(),
      );
    }
  },
};

export const entitySummaryBindHandler: GenerationHandlers<EntitySummaryBindTarget> = {
  streaming(_ctx: StreamingContext<EntitySummaryBindTarget>, _newText: string): void {
    // Background generation — no streaming display
  },

  async completion(ctx: CompletionContext<EntitySummaryBindTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      ctx.dispatch(
        entitySummaryUpdated({
          entityId: ctx.target.entityId,
          summary: ctx.accumulatedText.trim(),
        }),
      );
    }
  },
};

export const threadSummaryHandler: GenerationHandlers<ThreadSummaryTarget> = {
  streaming(ctx: StreamingContext<ThreadSummaryTarget>, _newText: string): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<ThreadSummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      await api.v1.storyStorage.set(
        EDIT_PANE_CONTENT,
        ctx.accumulatedText.trim(),
      );
    }
  },
};
