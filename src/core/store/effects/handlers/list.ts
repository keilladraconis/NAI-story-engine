import { DulfsFieldID } from "../../../../config/field-definitions";
import { dulfsItemAdded } from "../../index";
import {
  GenerationHandlers,
  ListTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

export const listHandler: GenerationHandlers<ListTarget> = {
  // List streaming is not displayed (parsed at the end)
  streaming(_ctx: StreamingContext<ListTarget>, _newText: string): void {
    // No-op: list content is parsed at completion
  },

  async completion(ctx: CompletionContext<ListTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;

    // Parse generated list and create DULFS items (names only)
    const lines = ctx.accumulatedText.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      // Strip bullets, numbers, dashes, and extract clean name
      const match = line.match(/^[\s\-*+•\d.)\]]*(.+)$/);
      if (match) {
        const name = match[1]
          .trim()
          .replace(/^[:\-–—]\s*/, "") // Strip leading colons/dashes
          .replace(/[:\-–—].*$/, "") // Strip trailing descriptions
          .trim();

        if (name) {
          const itemId = api.v1.uuid();

          // Store only the name in storyStorage
          await api.v1.storyStorage.set(`dulfs-item-${itemId}`, name);

          // Dispatch minimal item
          ctx.dispatch(
            dulfsItemAdded({
              fieldId: ctx.target.fieldId as DulfsFieldID,
              item: {
                id: itemId,
                fieldId: ctx.target.fieldId as DulfsFieldID,
              },
            }),
          );
        }
      }
    }
  },
};
