// Every generation target must map to a queue entry.
//
// `targetToQueueEntry` is reached by the CONTINUATION path, which only runs for
// a strategy that declares `continuation`. That made the switch's missing cases
// invisible for as long as no continuing strategy used them: adding
// `continuation` to the Forge turned "unreachable" into a hard throw on every
// forge pass — "Unhandled target type: forgeChat" — and the pass died after the
// model had already been paid for.
//
// The switch is exhaustive over the target union now, checked by the compiler,
// so a new target type cannot be added without a queue entry. This test covers
// the runtime half: that each case returns the queue type the rest of the
// system matches on. `forge.handleSend` blocks a second send by comparing
// `activeRequest.type` to "forgeChat", so a wrong mapping here is not cosmetic.
import { describe, it, expect } from "vitest";
import { targetToQueueEntry } from "../../../../src/core/store/effects/generation-engine";
import type { GenerationStrategy } from "../../../../src/core/store/types";

type Target = GenerationStrategy["target"];

const TARGETS: { target: Target; type: string; targetId: string }[] = [
  {
    target: { type: "chat", chatId: "c", messageId: "m" },
    type: "chat",
    targetId: "m",
  },
  {
    target: {
      type: "chatRefine",
      chatId: "c",
      messageId: "m",
      fieldId: "attg",
    },
    type: "chatRefine",
    targetId: "m",
  },
  {
    target: { type: "forgeChat", chatId: "c", messageId: "m" },
    type: "forgeChat",
    targetId: "m",
  },
  {
    target: {
      type: "forgeCleanup",
      chatId: "c",
      messageId: "m",
      discardedNames: [],
    },
    type: "forgeCleanup",
    targetId: "m",
  },
  { target: { type: "list", fieldId: "f" }, type: "list", targetId: "f" },
  {
    target: { type: "lorebookContent", entryId: "e" },
    type: "lorebookContent",
    targetId: "e",
  },
  {
    target: { type: "lorebookKeys", entryId: "e" },
    type: "lorebookKeys",
    targetId: "e",
  },
  {
    target: { type: "bootstrap" },
    type: "bootstrap",
    targetId: "bootstrap",
  },
] as { target: Target; type: string; targetId: string }[];

describe("targetToQueueEntry", () => {
  it("maps every target it is given without throwing", () => {
    expect(TARGETS.length).toBeGreaterThan(6);
    for (const { target, type, targetId } of TARGETS) {
      expect(() => targetToQueueEntry(target), target.type).not.toThrow();
      expect(targetToQueueEntry(target), target.type).toEqual({
        type,
        targetId,
      });
    }
  });

  it("maps a forge pass to the forgeChat queue type", () => {
    // The case that was missing. Named on its own so the failure reads as the
    // bug rather than as one row of a table.
    expect(
      targetToQueueEntry({ type: "forgeChat", chatId: "c", messageId: "m" }),
    ).toEqual({ type: "forgeChat", targetId: "m" });
  });
});
