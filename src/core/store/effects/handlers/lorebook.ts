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
import { LOREBOOK_CHAIN_STOPS, trimStopTail } from "../../../utils/config";
import { segaKeysCompleted } from "../../slices/runtime";
import { stripThinkingTags } from "../../../utils/tag-parser";

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
        const cleaned = trimStopTail(
          stripThinkingTags(ctx.accumulatedText),
          LOREBOOK_CHAIN_STOPS,
        );
        const fullContent = prefill + cleaned;

        // Erato compatibility: prepend separator if needed
        const erato = (await api.v1.config.get("erato_compatibility")) || false;
        const finalContent =
          erato && !fullContent.startsWith("----\n")
            ? "----\n" + fullContent
            : fullContent;

        // Update lorebook entry with generated content
        await api.v1.lorebook.updateEntry(entryId, {
          text: finalContent,
        });

        // Insert a stub key so the entry activates in story text immediately.
        // displayName.toLowerCase() doubles as an unambiguous sentinel (single key
        // matching the lorebook title) and as a useful plain-text activation key.
        // Stage 7 (keys) replaces it with map-informed proper keys.
        const lorebookEntry = await api.v1.lorebook.entry(entryId);
        const stubKey = (lorebookEntry?.displayName || "").toLowerCase();
        await api.v1.lorebook.updateEntry(entryId, { keys: [stubKey] });

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

/**
 * Validate a single key — plain text passes through, regex keys are checked.
 * Regex format: /pattern/[imsu] — rejects malformed or overbroad patterns.
 * Compound keys (parts joined by " & ") are validated recursively.
 */
function validateKey(key: string): string | null {
  // Compound key (e.g. "elara & operating") — validate each part
  if (key.includes(" & ")) {
    const parts = key
      .split(" & ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;
    const validated = parts.map((p) => validateKey(p));
    if (validated.some((v) => v === null)) return null;
    return validated.join(" & ");
  }

  // Plain text key
  if (!key.startsWith("/")) return key;

  // Regex key: must be /pattern/ or /pattern/flags
  const match = key.match(/^\/(.+)\/([imsu]*)$/);
  if (!match) {
    api.v1.log(`[lorebook-keys] dropping malformed regex: ${key}`);
    return null;
  }
  const [, pattern, flags] = match;
  try {
    const re = new RegExp(pattern, flags);
    // Reject overbroad patterns that match very short strings
    const shortStrings = [
      "ab",
      "el",
      "th",
      "an",
      "in",
      "re",
      "st",
      "any",
      "the",
      "len",
      "ion",
      "ing",
      "ers",
      "for",
      "are",
    ];
    if (shortStrings.some((s) => re.test(s))) {
      api.v1.log(`[lorebook-keys] dropping overbroad regex: ${key}`);
      return null;
    }
    return key;
  } catch {
    api.v1.log(`[lorebook-keys] dropping invalid regex: ${key}`);
    return null;
  }
}

export function parseLorebookKeys(text: string): string[] | null {
  const lines = text.split("\n");
  const keyLineIdx = lines.findIndex((l) => /^keys:/i.test(l.trim()));
  if (keyLineIdx === -1) return null;

  // Extract inline content after "KEYS:" on the same line
  const inlineContent = lines[keyLineIdx].replace(/^keys:/i, "").trim();

  // If no inline content, LLM used multi-line format — collect subsequent non-blank lines
  let rawKeys = inlineContent;
  if (!rawKeys) {
    const nextLines: string[] = [];
    for (let i = keyLineIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) break;
      if (/^keys:/i.test(line)) break;
      nextLines.push(line);
    }
    rawKeys = nextLines.join(", ");
  }

  if (!rawKeys) return null;

  return rawKeys
    .split(",")
    .map((k) => {
      // Wider dash class: hyphen, en-dash, em-dash, bullet, asterisk
      const cleaned = k.trim().replace(/^[\-\u2013\u2014\u2022*]\s*/, "");
      // Don't lowercase regex keys — they control case sensitivity via /i flag
      const normalized = cleaned.startsWith("/")
        ? cleaned
        : cleaned.toLowerCase();
      return validateKey(normalized);
    })
    .filter((k): k is string => k !== null && k.length > 0 && k.length < 50);
}

/**
 * Extract lowercase word tokens from an entry display name for use as fallback keys.
 * Splits on whitespace, commas, hyphens, and underscores; drops single-character tokens.
 */
export function keysFromDisplayName(displayName: string): string[] {
  return displayName
    .toLowerCase()
    .split(/[\s,_-]+/)
    .filter((w) => w.length > 1 && w.length < 50);
}

export const lorebookKeysHandler: GenerationHandlers<LorebookKeysTarget> = {
  streaming(
    _ctx: StreamingContext<LorebookKeysTarget>,
    _newText: string,
  ): void {
    // No streaming display for keys — raw LLM output is noisy mid-stream
  },

  async completion(ctx: CompletionContext<LorebookKeysTarget>): Promise<void> {
    const currentSelected = ctx.getState().ui.lorebook.selectedEntryId;

    if (ctx.generationSucceeded && ctx.accumulatedText) {
      let keys = parseLorebookKeys(stripThinkingTags(ctx.accumulatedText));

      if (!keys) {
        api.v1.log(
          `[lorebook-keys] no KEYS: line found for ${ctx.target.entryId.slice(0, 8)} — falling back to display name`,
        );
        const entry = await api.v1.lorebook.entry(ctx.target.entryId);
        keys = entry?.displayName ? keysFromDisplayName(entry.displayName) : [];
      }

      if (keys.length === 0) return;

      // Mark completed BEFORE async reads to prevent re-queue race condition
      ctx.dispatch(segaKeysCompleted({ entryId: ctx.target.entryId }));

      // Merge with existing keys (dedup case-insensitive, preserve first casing)
      // Drop the displayName stub — real keys have arrived
      const entry = await api.v1.lorebook.entry(ctx.target.entryId);
      const existing = entry?.keys || [];
      const stubKey = (entry?.displayName || "").toLowerCase();
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const k of [...existing, ...keys]) {
        const lower = k.toLowerCase();
        if (lower === stubKey && keys.length > 0) continue;
        if (!seen.has(lower)) {
          seen.add(lower);
          merged.push(k);
        }
      }

      await api.v1.lorebook.updateEntry(ctx.target.entryId, { keys: merged });

      // Update draft with parsed keys if viewing this entry
      // (storageKey binding auto-updates UI)
      if (ctx.target.entryId === currentSelected) {
        await api.v1.storyStorage.set(
          IDS.LOREBOOK.KEYS_DRAFT_RAW,
          keys.join(", "),
        );
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
      const cleaned = trimStopTail(
        stripThinkingTags(ctx.accumulatedText),
        LOREBOOK_CHAIN_STOPS,
      );
      const fullContent = prefill + cleaned;

      // Erato compatibility: prepend separator if needed
      const erato = (await api.v1.config.get("erato_compatibility")) || false;
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
