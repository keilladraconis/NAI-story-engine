import { GenerationStrategy, ShapeData } from "../../types";
import {
  shapeUpdated,
  intentUpdated,
  worldStateUpdated,
  tensionEdited,
  attgUpdated,
  styleUpdated,
} from "../../index";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { IDS } from "../../../../ui/framework/ids";
import { escapeForMarkdown } from "../../../../ui/utils";
import { store } from "../../../../core/store";

type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;

/** Shape streaming updates the description text below the card. */
const VIEW_IDS = {
  shape: "se-fn-shape-card-desc",
  intent: "se-fn-intent-card-desc",
  attg: "se-fn-attg-card-desc",
  style: "se-fn-style-card-desc",
  worldState: `${IDS.FOUNDATION.WORLD_STATE_TEXT}-view`,
} as const;

/**
 * Parses shape generation output into { name, description }.
 *
 * Two cases:
 *  - Existing shape name in state → model only generated the description.
 *    Output: { name: existingName, description: text }
 *
 *  - No existing shape → model invented both.
 *    Format: "Hero's Journey\n\nLean toward the moment of return..."
 *    Output: { name: firstLine, description: rest }
 */
function parseShape(text: string): ShapeData {
  const existingName = store.getState().foundation.shape?.name ?? "";

  if (existingName) {
    // Name was pre-filled — entire output is the description
    return { name: existingName, description: text.trim() };
  }

  // Model invented name + description: first line is name, rest is description
  const lines = text.split("\n");
  const name = lines[0].trim();
  const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "");
  const description =
    blankIdx > 0
      ? lines
          .slice(blankIdx + 1)
          .join("\n")
          .trim()
      : lines.slice(1).join("\n").trim();

  return { name, description: description || text.trim() };
}

type TensionTarget = Extract<GenerationStrategy["target"], { type: "tension" }>;

export const tensionHandler: GenerationHandlers<TensionTarget> = {
  streaming(ctx: StreamingContext<TensionTarget>, _newText: string): void {
    const viewId = `${IDS.FOUNDATION.tension(ctx.target.tensionId).TEXT}-view`;
    api.v1.ui.updateParts([
      { id: viewId, text: escapeForMarkdown(ctx.accumulatedText) },
    ]);
  },

  async completion(ctx: CompletionContext<TensionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;
    ctx.dispatch(
      tensionEdited({
        tensionId: ctx.target.tensionId,
        text: ctx.accumulatedText.trim(),
      }),
    );
  },
};

export const foundationHandler: GenerationHandlers<FoundationTarget> = {
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    const viewId = VIEW_IDS[ctx.target.field];
    api.v1.ui.updateParts([
      { id: viewId, text: escapeForMarkdown(ctx.accumulatedText) },
    ]);
  },

  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = ctx.accumulatedText.trim();

    switch (ctx.target.field) {
      case "shape": {
        const shape = parseShape(text);
        ctx.dispatch(shapeUpdated({ shape }));
        break;
      }
      case "intent": {
        ctx.dispatch(intentUpdated({ intent: text }));
        break;
      }
      case "worldState": {
        ctx.dispatch(worldStateUpdated({ worldState: text }));
        break;
      }
      case "attg": {
        ctx.dispatch(attgUpdated({ attg: text }));
        if (store.getState().foundation.attgSyncEnabled) {
          await api.v1.memory.set(text.trim());
        }
        break;
      }
      case "style": {
        ctx.dispatch(styleUpdated({ style: text }));
        if (store.getState().foundation.styleSyncEnabled) {
          await api.v1.an.set(text.trim());
        }
        break;
      }
    }
  },
};
