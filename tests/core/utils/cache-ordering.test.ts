import { describe, it, expect } from "vitest";
import {
  hashString,
  hashEntryPosition,
} from "../../../src/core/utils/seeded-random";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create N fake entry IDs */
const makeEntryIds = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `entry-${String(i).padStart(3, "0")}`);

/** Sort entry IDs by hash position (mirrors lorebook-context.ts logic) */
const hashSort = (ids: string[], seed: number): string[] =>
  [...ids].sort((a, b) => hashEntryPosition(seed, a) - hashEntryPosition(seed, b));

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Cache Ordering Strategy", () => {
  const SEED = hashString("test-story-id-12345");

  describe("hashEntryPosition stability", () => {
    it("produces the same hash for the same seed+id pair", () => {
      const h1 = hashEntryPosition(SEED, "entry-abc");
      const h2 = hashEntryPosition(SEED, "entry-abc");
      expect(h1).toBe(h2);
    });

    it("produces different hashes for different IDs", () => {
      const h1 = hashEntryPosition(SEED, "entry-001");
      const h2 = hashEntryPosition(SEED, "entry-002");
      expect(h1).not.toBe(h2);
    });

    it("produces different hashes for different seeds", () => {
      const h1 = hashEntryPosition(100, "entry-001");
      const h2 = hashEntryPosition(200, "entry-001");
      expect(h1).not.toBe(h2);
    });
  });

  describe("hash-sort vs Fisher-Yates stability", () => {
    it("adding an entry does not change the relative order of existing entries", () => {
      const original = makeEntryIds(10);
      const sorted = hashSort(original, SEED);

      // Add a new entry
      const withNew = [...original, "entry-NEW"];
      const sortedWithNew = hashSort(withNew, SEED);

      // Remove the new entry from the result to get original-only ordering
      const sortedOriginalOnly = sortedWithNew.filter((id) => id !== "entry-NEW");

      // The relative order of original entries must be identical
      expect(sortedOriginalOnly).toEqual(sorted);
    });

    it("adding multiple entries preserves relative order of originals", () => {
      const original = makeEntryIds(15);
      const sorted = hashSort(original, SEED);

      // Add 5 new entries
      const newEntries = ["new-A", "new-B", "new-C", "new-D", "new-E"];
      const withNew = [...original, ...newEntries];
      const sortedWithNew = hashSort(withNew, SEED);

      const sortedOriginalOnly = sortedWithNew.filter(
        (id) => !newEntries.includes(id),
      );

      expect(sortedOriginalOnly).toEqual(sorted);
    });

    it("removing an entry does not change the relative order of remaining entries", () => {
      const original = makeEntryIds(10);
      const sorted = hashSort(original, SEED);

      // Remove entry at index 5
      const withRemoved = original.filter((_, i) => i !== 5);
      const removedId = original[5];
      const sortedWithRemoved = hashSort(withRemoved, SEED);

      // Should be identical to original sort minus the removed entry
      const expectedSort = sorted.filter((id) => id !== removedId);
      expect(sortedWithRemoved).toEqual(expectedSort);
    });
  });

  describe("SEGA append-only cross-reference behavior", () => {
    /**
     * Simulates the SEGA lorebook content phase:
     * - All entries start without content
     * - SEGA picks entries in hash order (lowest hash first)
     * - For each generation, cross-references = entries WITH content, hash-sorted, excluding current
     * - After generation, the entry gains content
     *
     * The cross-reference list for each generation should be a PREFIX of the next.
     */
    it("generates entries in order that produces append-only cross-ref growth", () => {
      const entries = makeEntryIds(10);
      const entriesWithContent = new Set<string>();

      // SEGA order: sort all entries by hash, pick from lowest
      const segaOrder = hashSort(entries, SEED);

      const crossRefSnapshots: string[][] = [];

      for (const entryId of segaOrder) {
        // Build cross-refs: entries with content, excluding current, hash-sorted
        const crossRefIds = entries.filter(
          (id) => id !== entryId && entriesWithContent.has(id),
        );
        const sortedCrossRefs = hashSort(crossRefIds, SEED);

        crossRefSnapshots.push(sortedCrossRefs);

        // Entry gains content after generation
        entriesWithContent.add(entryId);
      }

      // Verify: each snapshot is a prefix of the next
      for (let i = 0; i < crossRefSnapshots.length - 1; i++) {
        const current = crossRefSnapshots[i];
        const next = crossRefSnapshots[i + 1];

        // Next should be longer (one more entry)
        expect(next.length).toBe(current.length + 1);

        // Current should be a prefix of next
        for (let j = 0; j < current.length; j++) {
          expect(next[j]).toBe(current[j]);
        }
      }
    });

    it("first generation has empty cross-refs, last has all-but-one", () => {
      const entries = makeEntryIds(8);
      const segaOrder = hashSort(entries, SEED);
      const entriesWithContent = new Set<string>();

      // First generation
      const firstCrossRefs = entries.filter(
        (id) => id !== segaOrder[0] && entriesWithContent.has(id),
      );
      expect(firstCrossRefs).toEqual([]);

      // Simulate all but last
      for (let i = 0; i < segaOrder.length - 1; i++) {
        entriesWithContent.add(segaOrder[i]);
      }

      // Last generation's cross-refs should have all entries except the last one being generated
      const lastCrossRefs = entries.filter(
        (id) =>
          id !== segaOrder[segaOrder.length - 1] && entriesWithContent.has(id),
      );
      expect(lastCrossRefs.length).toBe(entries.length - 1);
    });
  });

  describe("prefix stability under realistic conditions", () => {
    /**
     * Simulate building the full message array for each SEGA generation
     * and verify that the "stable prefix" portion doesn't change.
     */
    it("stable prefix messages are identical across SEGA generations", () => {
      const systemPrompt = "You are a worldbuilding assistant.";
      const basePrompt = "Generate a lorebook entry for [itemName]";
      const weaving = "Cross-reference other entries for consistency.";
      const storyContext = "A dark fantasy world with ancient magic.";

      const entries = makeEntryIds(5);
      const segaOrder = hashSort(entries, SEED);
      const entriesWithContent = new Map<string, string>();

      const stablePrefixes: string[] = [];

      for (const entryId of segaOrder) {
        // Message 1: STABLE system prompt + base prompt + weaving
        const msg1 = `${systemPrompt}\n\n[LOREBOOK ENTRY GENERATION]\n${basePrompt}${weaving ? `\n\n${weaving}` : ""}`;

        // Message 2: Cross-reference entries (grows append-only)
        const crossRefIds = entries.filter(
          (id) => id !== entryId && entriesWithContent.has(id),
        );
        const sortedCrossRefs = hashSort(crossRefIds, SEED);
        const crossRefContent = sortedCrossRefs
          .map((id) => `--- ${id} ---\n${entriesWithContent.get(id)}`)
          .join("\n\n");

        // Message 3: Story context (stable)
        const msg3 = `[STORY CONTEXT]\n${storyContext}`;

        // Message 4 (template) varies per category but sits AFTER this prefix,
        // so it doesn't invalidate the cache — that's the whole point of the split.

        // The stable prefix = msg1 + cross-refs + msg3
        const stablePrefix = [msg1, crossRefContent, msg3].join("|||");
        stablePrefixes.push(stablePrefix);

        // Simulate generation completing
        entriesWithContent.set(entryId, `Content for ${entryId}`);
      }

      // Verify: each stable prefix is a "prefix extension" of the previous
      // (msg1 and msg3 are identical, cross-refs only grow)
      for (let i = 0; i < stablePrefixes.length - 1; i++) {
        const current = stablePrefixes[i];
        const next = stablePrefixes[i + 1];

        // The next prefix should START WITH the current prefix's content
        // (because cross-refs append, and msg1/msg3 don't change)
        // Actually, since cross-refs grow by inserting a new entry at the END,
        // the cross-ref portion is: prev + "\n\n" + newEntry
        // So next's cross-ref content starts with current's cross-ref content

        // Split to check each message component
        const [curMsg1, curCrossRef, curMsg3] = current.split("|||");
        const [nextMsg1, nextCrossRef, nextMsg3] = next.split("|||");

        // System prompt is identical
        expect(nextMsg1).toBe(curMsg1);

        // Story context is identical
        expect(nextMsg3).toBe(curMsg3);

        // Cross-refs: next starts with current (append-only growth)
        if (curCrossRef) {
          expect(nextCrossRef.startsWith(curCrossRef)).toBe(true);
        }
      }
    });
  });
});
