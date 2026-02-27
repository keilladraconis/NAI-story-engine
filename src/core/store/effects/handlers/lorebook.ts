import { IDS } from "../../../../ui/framework/ids";
import {
  GenerationHandlers,
  LorebookContentTarget,
  LorebookRelationalMapTarget,
  LorebookKeysTarget,
  LorebookRefineTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { buildLorebookPrefill, CATEGORY_TO_TYPE } from "../../../utils/lorebook-strategy";
import { segaRelationalMapStored } from "../../slices/runtime";

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

      // Insert a stub key so the entry activates in story text immediately.
      // Stage 7 (keys) will replace this with map-informed proper keys.
      // The stub is just the lowercased entry name; findEntryNeedingKeys
      // detects stubs by checking for a single key equal to the display name.
      const lorebookEntry = await api.v1.lorebook.entry(entryId);
      const stubKey = (lorebookEntry?.displayName || "").toLowerCase();
      await api.v1.lorebook.updateEntry(entryId, {
        keys: [stubKey],
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

export const lorebookRelationalMapHandler: GenerationHandlers<LorebookRelationalMapTarget> = {
  streaming(ctx: StreamingContext<LorebookRelationalMapTarget>, _newText: string): void {
    // Stream to shared draft for progress visibility when entry is selected
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;
    if (ctx.target.entryId === currentSelected) {
      api.v1.storyStorage.set(IDS.LOREBOOK.MAP_DRAFT_RAW, ctx.accumulatedText);
    }
  },

  async completion(ctx: CompletionContext<LorebookRelationalMapTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText.trim()) {
      // Reconstruct the full map text: the factory's assistant prefill is
      // "${displayName} [${entryType}]\n  - primary locations:" but that prefix
      // is not included in accumulatedText (only the model's continuation is).
      const entry = await api.v1.lorebook.entry(ctx.target.entryId);
      const displayName = entry?.displayName || "Unknown";
      let categoryName = "";
      if (entry?.category) {
        const categories = await api.v1.lorebook.categories();
        const category = categories.find((c) => c.id === entry.category);
        categoryName = category?.name || "";
      }
      const entryType = CATEGORY_TO_TYPE[categoryName] || "Entry";
      const mapText = `${displayName} [${entryType}]\n  - primary locations:${ctx.accumulatedText}`.trim();

      ctx.dispatch(segaRelationalMapStored({
        entryId: ctx.target.entryId,
        mapText,
      }));
    }
    // On failure: no dispatch; state entry stays absent — keys factory falls back to prose
  },
};

export const lorebookKeysHandler: GenerationHandlers<LorebookKeysTarget> = {
  streaming(_ctx: StreamingContext<LorebookKeysTarget>, _newText: string): void {
    // No streaming display for keys — raw LLM output is noisy mid-stream
  },

  async completion(ctx: CompletionContext<LorebookKeysTarget>): Promise<void> {
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;

    if (ctx.generationSucceeded && ctx.accumulatedText) {
      // Find the KEYS: line — search all lines case-insensitively
      const keysLine = ctx.accumulatedText
        .split("\n")
        .find((l) => /^keys:/i.test(l.trim()));

      if (!keysLine) {
        api.v1.log(`[lorebook-keys] no KEYS: line found for ${ctx.target.entryId.slice(0, 8)} — skipping`);
        return;
      }

      const keysSource = keysLine.replace(/^keys:/i, "").trim();

      // Parse comma-separated keys
      const keys = keysSource
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
