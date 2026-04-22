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
 * Computes a stable hash position for a lorebook entry.
 * Each entry gets a fixed position regardless of how many other entries exist.
 * Used for cache-optimal ordering: new entries slot into position without
 * shifting existing entries.
 *
 * @param storyIdSeed - Numeric seed from story ID
 * @param entryId - Lorebook entry ID
 * @returns Unsigned 32-bit hash for sorting
 */
export const hashEntryPosition = (
  storyIdSeed: number,
  entryId: string,
): number => {
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
