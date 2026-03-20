import { GenerationStrategy } from "../../types";
import { shapeUpdated, intentUpdated, worldStateUpdated } from "../../index";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { IDS } from "../../../../ui/framework/ids";
import { escapeForMarkdown } from "../../../../ui/utils";

type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;

function viewIdForField(field: "shape" | "intent" | "worldState"): string {
  switch (field) {
    case "shape":      return `${IDS.FOUNDATION.SHAPE_TEXT}-view`;
    case "intent":     return `${IDS.FOUNDATION.INTENT_TEXT}-view`;
    case "worldState": return `${IDS.FOUNDATION.WORLD_STATE_TEXT}-view`;
  }
}

export const foundationHandler: GenerationHandlers<FoundationTarget> = {
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    const viewId = viewIdForField(ctx.target.field);
    api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(ctx.accumulatedText) }]);
  },

  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = ctx.accumulatedText.trim();
    switch (ctx.target.field) {
      case "shape":
        ctx.dispatch(shapeUpdated({ shape: text }));
        break;
      case "intent":
        ctx.dispatch(intentUpdated({ intent: text }));
        break;
      case "worldState":
        ctx.dispatch(worldStateUpdated({ worldState: text }));
        break;
    }
    const viewId = viewIdForField(ctx.target.field);
    api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(text) }]);
  },
};
