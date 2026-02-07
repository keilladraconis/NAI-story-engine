/**
 * Utilities for building lorebook cross-reference context.
 * Enables rich context injection from existing lorebook entries during generation.
 *
 * CONTEXT ORDERING STRATEGY:
 * Uses hash-based sorting (hash(storyId + entryId)) for stable ordering.
 * Each entry has a fixed position regardless of array size, so new entries
 * slot in without shifting others — enabling append-only token cache behavior.
 */

import { hashEntryPosition, getStoryIdSeed } from "./seeded-random";

/**
 * Options for building lorebook reference context.
 */
export interface LorebookReferenceOptions {
  /** Use hash-based sort for stable ordering (default: true) */
  shuffle?: boolean;
  /** Optional seed override (defaults to story ID) */
  seed?: number;
}

/**
 * Result from building lorebook reference context.
 */
export interface LorebookReferenceResult {
  /** Formatted context string */
  content: string;
  /** Approximate token count */
  tokenCount: number;
}


/**
 * Fetches all lorebook entries with full text content.
 * Optionally excludes a specific entry (e.g., the one being generated).
 */
export const getAllLorebookEntries = async (
  excludeId?: string,
): Promise<LorebookEntry[]> => {
  const entries = await api.v1.lorebook.entries();

  // Filter out disabled entries and the excluded entry
  return entries.filter((entry) => {
    if (!entry.enabled) return false;
    if (excludeId && entry.id === excludeId) return false;
    // Only include entries with actual content
    if (!entry.text || entry.text.trim().length === 0) return false;
    return true;
  });
};

/**
 * Formats a lorebook entry for context injection.
 */
const formatEntryForContext = (entry: LorebookEntry): string => {
  const name = entry.displayName || "Unnamed Entry";
  const text = entry.text || "";
  return `--- ${name} ---\n${text}`;
};

/**
 * Selects and formats lorebook entries for context injection.
 * Uses token budget to determine how many entries to include.
 *
 * @param excludeId - Entry ID to exclude (the one being generated)
 * @param tokenBudget - Maximum tokens to use for context
 * @param options - Configuration options
 * @returns Formatted context and token count
 */
export const buildLorebookReferenceContext = async (
  excludeId: string | undefined,
  tokenBudget: number,
  options: LorebookReferenceOptions = {},
): Promise<LorebookReferenceResult> => {
  const { shuffle = true, seed } = options;

  if (tokenBudget <= 0) {
    return { content: "", tokenCount: 0 };
  }

  const entries = await getAllLorebookEntries(excludeId);

  if (entries.length === 0) {
    return { content: "", tokenCount: 0 };
  }

  // Hash-sort for stable ordering: each entry has a fixed position regardless
  // of array size. New entries slot into position without shifting others,
  // enabling append-only token cache behavior during SEGA.
  let orderedEntries = entries;
  if (shuffle) {
    const effectiveSeed = seed ?? (await getStoryIdSeed());
    orderedEntries = [...entries].sort(
      (a, b) => hashEntryPosition(effectiveSeed, a.id) - hashEntryPosition(effectiveSeed, b.id),
    );
  }

  // Use RolloverHelper for token budget management
  const helper = api.v1.createRolloverHelper<{ content: string }>({
    maxTokens: tokenBudget,
    rolloverTokens: 0, // No rollover - strict budget
    model: "glm-4-6",
  });

  // Add entries until budget is exceeded
  for (const entry of orderedEntries) {
    const formatted = formatEntryForContext(entry);
    await helper.add({ content: formatted });
  }

  // Read entries that fit within budget
  const includedItems = helper.read();
  const totalTokens = helper.totalTokens();

  if (includedItems.length === 0) {
    return { content: "", tokenCount: 0 };
  }

  // Join all included entries
  const content = includedItems.map((item) => item.content).join("\n\n");

  return {
    content,
    tokenCount: totalTokens,
  };
};
