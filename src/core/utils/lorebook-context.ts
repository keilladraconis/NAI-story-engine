/**
 * Utilities for building lorebook cross-reference context.
 * Enables rich context injection from existing lorebook entries during generation.
 *
 * CONTEXT ORDERING STRATEGY:
 * Uses seeded pseudo-random shuffling based on story ID for stable ordering.
 * This maximizes token cache efficiency while maintaining variety across stories.
 * New entries naturally appear at the end of the context.
 */

import { seededShuffle, getStoryIdSeed } from "./seeded-random";

/**
 * Options for building lorebook reference context.
 */
export interface LorebookReferenceOptions {
  /** Use seeded shuffle for stable ordering (default: true) */
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
  excludeId: string,
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

  // Use seeded shuffle for stable ordering (maximizes token cache efficiency)
  // Seed defaults to story ID for consistency within the same story
  let orderedEntries = entries;
  if (shuffle) {
    const effectiveSeed = seed ?? (await getStoryIdSeed());
    orderedEntries = seededShuffle(entries, effectiveSeed);
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
