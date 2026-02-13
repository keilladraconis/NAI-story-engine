import { IDS } from "../../../../ui/framework/ids";
import {
  GenerationHandlers,
  LorebookContentTarget,
  LorebookKeysTarget,
  LorebookRefineTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { buildLorebookPrefill } from "../../../utils/lorebook-strategy";

// Cache for prefills during streaming (cleared on completion)
const prefillCache = new Map<string, string>();

/**
 * Get or compute the prefill for an entry, caching the result.
 * Returns cached value immediately if available, otherwise computes async.
 */
const getCachedPrefill = (entryId: string): string | null => {
  return prefillCache.get(entryId) ?? null;
};

/**
 * Ensure prefill is cached for an entry (call early in streaming).
 */
const ensurePrefillCached = async (entryId: string): Promise<void> => {
  if (!prefillCache.has(entryId)) {
    const prefill = await buildLorebookPrefill(entryId);
    prefillCache.set(entryId, prefill);
  }
};

/**
 * Clear cached prefill for an entry (call on completion).
 */
const clearPrefillCache = (entryId: string): void => {
  prefillCache.delete(entryId);
};

export const lorebookContentHandler: GenerationHandlers<LorebookContentTarget> =
  {
    streaming(
      ctx: StreamingContext<LorebookContentTarget>,
      _newText: string,
    ): void {
      const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
      if (ctx.target.entryId !== currentSelected) return;

      // Ensure prefill is being cached (fire-and-forget on first call)
      ensurePrefillCached(ctx.target.entryId);

      // Get cached prefill if available, prepend to streaming content
      const prefill = getCachedPrefill(ctx.target.entryId) || "";
      const displayContent = prefill + ctx.accumulatedText;

      api.v1.storyStorage.set(IDS.LOREBOOK.CONTENT_DRAFT_RAW, displayContent);
    },

    async completion(
      ctx: CompletionContext<LorebookContentTarget>,
    ): Promise<void> {
      const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
      const entryId = ctx.target.entryId;

      if (ctx.generationSucceeded && ctx.accumulatedText) {
        // Get prefill from cache or rebuild it
        let prefill = getCachedPrefill(entryId);
        if (!prefill) {
          prefill = await buildLorebookPrefill(entryId);
        }

        // Combine prefill + accumulated text for the full entry
        const fullContent = prefill + ctx.accumulatedText;

        // Erato compatibility: prepend separator if needed
        const erato =
          (await api.v1.config.get("erato_compatibility")) || false;
        const finalContent =
          erato && !fullContent.startsWith("----\n")
            ? "----\n" + fullContent
            : fullContent;

        // Update lorebook entry with generated content
        await api.v1.lorebook.updateEntry(entryId, {
          text: finalContent,
        });

        // Update draft with full content if viewing this entry
        if (entryId === currentSelected) {
          await api.v1.storyStorage.set(
            IDS.LOREBOOK.CONTENT_DRAFT_RAW,
            finalContent,
          );
        }
      } else {
        // Cancelled or failed: restore draft to original content if viewing this entry
        if (entryId === currentSelected) {
          await api.v1.storyStorage.set(
            IDS.LOREBOOK.CONTENT_DRAFT_RAW,
            ctx.originalContent || "",
          );
        }
      }

      // Clear cache for this entry
      clearPrefillCache(entryId);
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
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 0 && k.length < 50);

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

export const lorebookRefineHandler: GenerationHandlers<LorebookRefineTarget> = {
  streaming(
    ctx: StreamingContext<LorebookRefineTarget>,
    _newText: string,
  ): void {
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
    if (ctx.target.entryId !== currentSelected) return;

    // Ensure prefill is being cached (fire-and-forget on first call)
    ensurePrefillCached(ctx.target.entryId);

    // Get cached prefill if available, prepend to streaming content
    const prefill = getCachedPrefill(ctx.target.entryId) || "";
    const displayContent = prefill + ctx.accumulatedText;

    api.v1.storyStorage.set(IDS.LOREBOOK.CONTENT_DRAFT_RAW, displayContent);
  },

  async completion(
    ctx: CompletionContext<LorebookRefineTarget>,
  ): Promise<void> {
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
    const entryId = ctx.target.entryId;

    if (ctx.generationSucceeded && ctx.accumulatedText) {
      // Get prefill from cache or rebuild it
      let prefill = getCachedPrefill(entryId);
      if (!prefill) {
        prefill = await buildLorebookPrefill(entryId);
      }

      // Combine prefill + accumulated text for the full entry
      const fullContent = prefill + ctx.accumulatedText;

      // Erato compatibility: prepend separator if needed
      const erato =
        (await api.v1.config.get("erato_compatibility")) || false;
      const finalContent =
        erato && !fullContent.startsWith("----\n")
          ? "----\n" + fullContent
          : fullContent;

      // Update lorebook entry with refined content
      await api.v1.lorebook.updateEntry(entryId, {
        text: finalContent,
      });

      // Update draft with full content if viewing this entry
      if (entryId === currentSelected) {
        await api.v1.storyStorage.set(
          IDS.LOREBOOK.CONTENT_DRAFT_RAW,
          finalContent,
        );
      }

      // Clear instructions on success
      await api.v1.storyStorage.set(IDS.LOREBOOK.REFINE_INSTRUCTIONS_RAW, "");
    } else {
      // Cancelled or failed: restore draft to original content if viewing this entry
      if (entryId === currentSelected) {
        await api.v1.storyStorage.set(
          IDS.LOREBOOK.CONTENT_DRAFT_RAW,
          ctx.originalContent || "",
        );
      }
    }

    // Clear cache for this entry
    clearPrefillCache(entryId);
  },
};
