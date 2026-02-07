/**
 * Seeded pseudo-random number generator utilities.
 * Provides deterministic randomness based on a seed (story ID).
 * Ensures stable context ordering for token cache efficiency.
 */

/**
 * Simple hash function to convert string to number seed.
 * Uses djb2 algorithm for fast, reasonable distribution.
 */
export const hashString = (str: string): number => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
};

/**
 * Creates a seeded PRNG using mulberry32 algorithm.
 * Fast and produces good quality random numbers.
 *
 * @param seed - Numeric seed value
 * @returns Function that returns next random number [0, 1)
 */
export const createSeededRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Shuffles an array using Fisher-Yates with a seeded PRNG.
 * Produces deterministic ordering for the same seed.
 *
 * @param array - Array to shuffle
 * @param seed - Numeric seed for deterministic shuffling
 * @returns New shuffled array (original not modified)
 */
export const seededShuffle = <T>(array: T[], seed: number): T[] => {
  const result = [...array];
  const random = createSeededRandom(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
};

/**
 * Computes a stable hash position for a lorebook entry.
 * Each entry gets a fixed position regardless of how many other entries exist.
 * Used for cache-optimal ordering: new entries slot into position without
 * shifting existing entries.
 *
 * @param storyIdSeed - Numeric seed from story ID
 * @param entryId - Lorebook entry ID
 * @returns Unsigned 32-bit hash for sorting
 */
export const hashEntryPosition = (storyIdSeed: number, entryId: string): number => {
  return hashString(`${storyIdSeed}:${entryId}`);
};

/**
 * Gets the current story ID for use as a seed.
 * Falls back to a constant if story ID is unavailable.
 */
export const getStoryIdSeed = async (): Promise<number> => {
  try {
    const storyId = await api.v1.story.id();
    if (storyId) {
      return hashString(storyId);
    }
  } catch {
    // Story ID not available
  }
  // Fallback seed - still deterministic within session
  return 42;
};

/**
 * Sorts items by creation order (array index), with optional seeded shuffle
 * within same-priority groups. New items naturally appear at the end.
 *
 * @param items - Items with id property
 * @param existingOrder - Array of IDs in creation order
 * @param seed - Optional seed for shuffling items not in existingOrder
 * @returns Sorted array with new items at end
 */
export const stableOrderWithNewAtEnd = <T extends { id: string }>(
  items: T[],
  existingOrder: string[],
  seed?: number,
): T[] => {
  // Partition into known (in creation order) and new items
  const orderMap = new Map(existingOrder.map((id, idx) => [id, idx]));

  const known: T[] = [];
  const unknown: T[] = [];

  for (const item of items) {
    if (orderMap.has(item.id)) {
      known.push(item);
    } else {
      unknown.push(item);
    }
  }

  // Sort known items by their creation order
  known.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  // Optionally shuffle unknown items (new entries) with seed
  const sortedUnknown = seed !== undefined ? seededShuffle(unknown, seed) : unknown;

  // Known items first (stable order), then new items at end
  return [...known, ...sortedUnknown];
};
