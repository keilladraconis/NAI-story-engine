import { DulfsFieldID } from "../../../../config/field-definitions";
import { WorldEntity } from "../../types";
import { entityForged } from "../../slices/world";
import { ensureCategory } from "../lorebook-sync";
import { extractEntityName } from "../../../utils/context-builder";
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

    const fieldId = ctx.target.fieldId as DulfsFieldID;

    // Parse generated list and create WorldEntities with lorebook entries
    const lines = ctx.accumulatedText.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      // Strip markdown FIRST (before bullet stripping eats markdown asterisks)
      const cleanLine = stripMarkdown(line);
      // Strip bullets, numbers, dashes, and extract full content
      const match = cleanLine.match(/^[\s\-+•\d.)\]]*(.+)$/);
      if (match) {
        const content = match[1].trim().replace(/^[:\-–—]\s*/, "");

        if (content) {
          const name = extractEntityName(content, fieldId);

          // Dedup: skip if name already exists (case-insensitive)
          const existing = Object.values(ctx.getState().world.entitiesById).find(
            (e) => e.name.toLowerCase() === name.toLowerCase() && e.categoryId === fieldId,
          );
          if (existing) {
            api.v1.log(`[list] Skipped duplicate: "${name}"`);
            continue;
          }

          const categoryId = await ensureCategory(fieldId);
          const lorebookEntryId = await api.v1.lorebook.createEntry({
            id: api.v1.uuid(),
            displayName: name,
            text: "",
            keys: [],
            enabled: true,
            category: categoryId,
          });

          const entity: WorldEntity = {
            id: api.v1.uuid(),
            categoryId: fieldId,
            lorebookEntryId,
            name,
            summary: content,
          };
          ctx.dispatch(entityForged({ entity }));
        }
      }
    }
  },
};
