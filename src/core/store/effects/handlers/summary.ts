import { EDIT_PANE_CONTENT } from "../../../keys";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { GenerationStrategy } from "../../types";
import { entitySummaryUpdated } from "../../index";
import { writeStream, clearStream } from "../../stream-buffer";

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
  streaming(
    ctx: StreamingContext<EntitySummaryTarget>,
    _newText: string,
  ): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
    // JSX pane reads the live text from the effect-free buffer; per-token, no
    // store dispatch. The pane stages the final into its editable draft.
    writeStream(`entity-summary:${ctx.target.entityId}`, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<EntitySummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      const trimmed = ctx.accumulatedText.trim();
      // Carry the final into the buffer for the open JSX pane to stage into its
      // draft (the pane owns clearing). NOT committed to the store when the pane
      // is open, so Back discards; Save commits.
      writeStream(`entity-summary:${ctx.target.entityId}`, trimmed);
      const editPaneOpen =
        ctx.getState().ui.activeEditId === ctx.target.entityId;
      if (editPaneOpen) {
        // Edit pane is open: stage in storyStorage for the user to review and save.
        await api.v1.storyStorage.set(EDIT_PANE_CONTENT, trimmed);
      } else {
        // Background generation: save directly to Redux.
        ctx.dispatch(
          entitySummaryUpdated({
            entityId: ctx.target.entityId,
            summary: trimmed,
          }),
        );
      }
    } else {
      clearStream(`entity-summary:${ctx.target.entityId}`);
    }
  },
};

export const entitySummaryBindHandler: GenerationHandlers<EntitySummaryBindTarget> =
  {
    streaming(
      _ctx: StreamingContext<EntitySummaryBindTarget>,
      _newText: string,
    ): void {
      // Background generation — no streaming display
    },

    async completion(
      ctx: CompletionContext<EntitySummaryBindTarget>,
    ): Promise<void> {
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
  streaming(
    ctx: StreamingContext<ThreadSummaryTarget>,
    _newText: string,
  ): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
    // JSX pane stages the live text from the effect-free buffer (per-token, no
    // store dispatch), then stages the final into its editable draft.
    writeStream(`thread-summary:${ctx.target.groupId}`, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<ThreadSummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      const trimmed = ctx.accumulatedText.trim();
      // Carry the final into the buffer for the open JSX pane to stage; the pane
      // owns clearing. Thread summary is only generated from the open pane, so
      // there is no background ...Updated branch (unlike entity summary).
      writeStream(`thread-summary:${ctx.target.groupId}`, trimmed);
      await api.v1.storyStorage.set(EDIT_PANE_CONTENT, trimmed);
    } else {
      clearStream(`thread-summary:${ctx.target.groupId}`);
    }
  },
};
