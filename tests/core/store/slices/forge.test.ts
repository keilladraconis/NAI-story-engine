import { describe, it, expect } from "vitest";
import {
  forgeSliceReducer,
  initialForgeState,
  tombstoneAdded,
  tombstonesClearedForChat,
  type Tombstone,
} from "../../../../src/core/store/slices/forge";

const TS1: Tombstone = { name: "Vesper", category: "Character", reason: "user" };
const TS2: Tombstone = { name: "Felix", category: "Character", reason: "model" };

describe("forgeSlice tombstones", () => {
  it("initial state has empty tombstonesByChatId", () => {
    expect(initialForgeState).toEqual({ tombstonesByChatId: {} });
  });

  it("tombstoneAdded appends a tombstone to the chat's list", () => {
    const next = forgeSliceReducer(
      initialForgeState,
      tombstoneAdded({ chatId: "c1", tombstone: TS1 }),
    );
    expect(next.tombstonesByChatId).toEqual({ c1: [TS1] });
  });

  it("tombstoneAdded appends to an existing chat list", () => {
    const seeded = { tombstonesByChatId: { c1: [TS1] } };
    const next = forgeSliceReducer(
      seeded,
      tombstoneAdded({ chatId: "c1", tombstone: TS2 }),
    );
    expect(next.tombstonesByChatId.c1).toEqual([TS1, TS2]);
  });

  it("tombstoneAdded deduplicates by name+category (case-insensitive)", () => {
    const seeded = { tombstonesByChatId: { c1: [TS1] } };
    const next = forgeSliceReducer(
      seeded,
      tombstoneAdded({
        chatId: "c1",
        tombstone: { name: "vesper", category: "Character", reason: "model" },
      }),
    );
    expect(next.tombstonesByChatId.c1).toEqual([TS1]);
  });

  it("tombstoneAdded does NOT dedup when name matches but category differs", () => {
    const seeded = { tombstonesByChatId: { c1: [TS1] } };
    const next = forgeSliceReducer(
      seeded,
      tombstoneAdded({
        chatId: "c1",
        tombstone: { name: "Vesper", category: "Location", reason: "user" },
      }),
    );
    expect(next.tombstonesByChatId.c1).toHaveLength(2);
    expect(next.tombstonesByChatId.c1[0]).toEqual(TS1);
    expect(next.tombstonesByChatId.c1[1]).toEqual({
      name: "Vesper",
      category: "Location",
      reason: "user",
    });
  });

  it("tombstonesClearedForChat removes only the targeted chat's list", () => {
    const seeded = {
      tombstonesByChatId: { c1: [TS1], c2: [TS2] },
    };
    const next = forgeSliceReducer(
      seeded,
      tombstonesClearedForChat({ chatId: "c1" }),
    );
    expect(next.tombstonesByChatId).toEqual({ c2: [TS2] });
  });

  it("tombstonesClearedForChat is a no-op when the chat has no list", () => {
    const next = forgeSliceReducer(
      initialForgeState,
      tombstonesClearedForChat({ chatId: "missing" }),
    );
    expect(next).toEqual(initialForgeState);
  });
});
