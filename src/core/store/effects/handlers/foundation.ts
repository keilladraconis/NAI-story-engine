import { GenerationStrategy, ShapeData } from "../../types";
import { shapeUpdated, intentUpdated, worldStateUpdated } from "../../index";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { IDS, STORAGE_KEYS } from "../../../../ui/framework/ids";
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

/**
 * Parses shape generation output into { name, description }.
 *
 * Two cases:
 *  - User pre-filled a name → model only generated the description.
 *    Detected by reading the stored name input value at completion time.
 *    Output: { name: storedName, description: text }
 *
 *  - User left name blank → model invented both.
 *    Format: "Hero's Journey\n\nLean toward the moment of return..."
 *    Output: { name: firstLine, description: rest }
 */
async function parseShape(text: string): Promise<ShapeData> {
  const storedName = String(
    (await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI)) || "",
  ).trim();

  if (storedName) {
    // Name was pre-filled — entire output is the description
    return { name: storedName, description: text.trim() };
  }

  // Model invented name + description: first line is name, rest is description
  const lines = text.split("\n");
  const name = lines[0].trim();
  const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "");
  const description = blankIdx > 0
    ? lines.slice(blankIdx + 1).join("\n").trim()
    : lines.slice(1).join("\n").trim();

  return { name, description: description || text.trim() };
}

export const foundationHandler: GenerationHandlers<FoundationTarget> = {
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    const viewId = viewIdForField(ctx.target.field);
    api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(ctx.accumulatedText) }]);
  },

  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = ctx.accumulatedText.trim();
    const viewId = viewIdForField(ctx.target.field);

    switch (ctx.target.field) {
      case "shape": {
        const shape = await parseShape(text);
        await api.v1.storyStorage.set(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI, shape.name);
        ctx.dispatch(shapeUpdated({ shape }));
        break;
      }
      case "intent":
        ctx.dispatch(intentUpdated({ intent: text }));
        api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(text) }]);
        break;
      case "worldState":
        ctx.dispatch(worldStateUpdated({ worldState: text }));
        api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(text) }]);
        break;
    }
  },
};
