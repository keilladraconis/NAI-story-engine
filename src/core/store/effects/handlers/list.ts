import { DulfsFieldID } from "../../../../config/field-definitions";
import { dulfsItemAdded } from "../../index";
import {
  GenerationHandlers,
  ListTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

/**
 * Strip markdown formatting from text.
 * Handles: ***bold+italic***, **bold**, *italic*, ___bold+italic___, __bold__, _italic_, ~~strikethrough~~
 * Uses [^X]+ instead of .+? to prevent matching across multiple format sections.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1") // ***bold+italic***
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/\*([^*]+)\*/g, "$1") // *italic*
    .replace(/___(.+?)___/g, "$1") // ___bold+italic___
    .replace(/__([^_]+)__/g, "$1") // __bold__
    .replace(/_([^_]+)_/g, "$1") // _italic_
    .replace(/~~([^~]+)~~/g, "$1"); // ~~strikethrough~~
}

export const listHandler: GenerationHandlers<ListTarget> = {
  // List streaming is not displayed (parsed at the end)
  streaming(_ctx: StreamingContext<ListTarget>, _newText: string): void {
    // No-op: list content is parsed at completion
  },

  async completion(ctx: CompletionContext<ListTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;

    // Parse generated list and create DULFS items with full content
    const lines = ctx.accumulatedText.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      // Strip bullets, numbers, dashes, and extract full content
      const match = line.match(/^[\s\-*+•\d.)\]]*(.+)$/);
      if (match) {
        let content = match[1].trim().replace(/^[:\-–—]\s*/, ""); // Strip leading colons/dashes only
        content = stripMarkdown(content); // Remove markdown formatting

        if (content) {
          const itemId = api.v1.uuid();

          // Store full content in storyStorage (name extraction happens in effects.ts)
          await api.v1.storyStorage.set(`dulfs-item-${itemId}`, content);

          // Dispatch item - lorebook sync (with parsed name) happens in effects.ts
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
