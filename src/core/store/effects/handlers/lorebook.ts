import { IDS } from "../../../../ui/framework/ids";
import {
  GenerationHandlers,
  LorebookContentTarget,
  LorebookKeysTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";

export const lorebookContentHandler: GenerationHandlers<LorebookContentTarget> =
  {
    streaming(
      ctx: StreamingContext<LorebookContentTarget>,
      _newText: string,
    ): void {
      // Stream to storageKey - UI auto-updates via binding
      const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
      if (ctx.target.entryId === currentSelected) {
        api.v1.storyStorage.set(
          IDS.LOREBOOK.CONTENT_DRAFT_RAW,
          ctx.accumulatedText,
        );
      }
    },

    async completion(
      ctx: CompletionContext<LorebookContentTarget>,
    ): Promise<void> {
      const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;

      if (ctx.generationSucceeded && ctx.accumulatedText) {
        // Clean output: strip leading delimiter if present
        let cleanedContent = ctx.accumulatedText;
        if (cleanedContent.startsWith("----")) {
          cleanedContent = cleanedContent.slice(4).trimStart();
        }

        // Update lorebook entry with generated content
        await api.v1.lorebook.updateEntry(ctx.target.entryId, {
          text: cleanedContent,
        });

        // Update draft with cleaned content if viewing this entry
        // (storageKey binding auto-updates UI)
        if (ctx.target.entryId === currentSelected) {
          await api.v1.storyStorage.set(
            IDS.LOREBOOK.CONTENT_DRAFT_RAW,
            cleanedContent,
          );
        }
      } else {
        // Cancelled or failed: restore draft to original content if viewing this entry
        // (storageKey binding auto-updates UI)
        if (ctx.target.entryId === currentSelected) {
          await api.v1.storyStorage.set(
            IDS.LOREBOOK.CONTENT_DRAFT_RAW,
            ctx.originalContent || "",
          );
        }
      }
    },
  };

export const lorebookKeysHandler: GenerationHandlers<LorebookKeysTarget> = {
  streaming(ctx: StreamingContext<LorebookKeysTarget>, _newText: string): void {
    // Stream to storageKey - UI auto-updates via binding
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
    if (ctx.target.entryId === currentSelected) {
      api.v1.storyStorage.set(IDS.LOREBOOK.KEYS_DRAFT_RAW, ctx.accumulatedText);
    }
  },

  async completion(ctx: CompletionContext<LorebookKeysTarget>): Promise<void> {
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;

    if (ctx.generationSucceeded && ctx.accumulatedText) {
      // Parse comma-separated keys
      const keys = ctx.accumulatedText
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length < 50); // Filter invalid keys

      // Update lorebook entry with generated keys
      await api.v1.lorebook.updateEntry(ctx.target.entryId, { keys });

      // Update draft with parsed keys if viewing this entry
      // (storageKey binding auto-updates UI)
      if (ctx.target.entryId === currentSelected) {
        const keysStr = keys.join(", ");
        await api.v1.storyStorage.set(IDS.LOREBOOK.KEYS_DRAFT_RAW, keysStr);
      }
    } else {
      // Cancelled or failed: restore draft to original keys if viewing this entry
      // (storageKey binding auto-updates UI)
      if (ctx.target.entryId === currentSelected) {
        await api.v1.storyStorage.set(
          IDS.LOREBOOK.KEYS_DRAFT_RAW,
          ctx.originalKeys || "",
        );
      }
    }
  },
};
