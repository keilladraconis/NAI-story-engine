import { describe, it, expect } from "vitest";
import {
  dedupe,
  ENGINE_LOOP_KEY,
  intentKey,
} from "../../../src/core/engine/intents";
import type { Intent } from "../../../src/core/engine/loop-machine";
import { STORAGE_KEYS } from "../../../src/core/keys";

/** The prose the pass that raised these intents read. Identity ignores it —
 *  `intentKey` is the work, not the request — so it is one constant here. */
const PROSE = "The press took Ada's left hand.";

const revise = (id: string): Intent => ({
  kind: "revise",
  entityId: id,
  prose: PROSE,
});
describe("intentKey", () => {
  it("distinguishes kinds acting on the same subject", () => {
    expect(intentKey({ kind: "revise", entityId: "x", prose: PROSE })).not.toBe(
      intentKey({ kind: "condense", entryId: "x" }),
    );
  });

  it("gives every kind its own key for one shared id string", () => {
    // Entity ids and lorebook entry ids are both UUIDs from the same
    // generator, so "same string, different kind" is reachable in practice.
    // Two kinds naming "x" must be two distinct pieces of work.
    const keys = [
      intentKey({ kind: "revise", entityId: "x", prose: PROSE }),
      intentKey({ kind: "condense", entryId: "x" }),
    ];
    expect(new Set(keys).size).toBe(2);
  });
});

describe("dedupe", () => {
  it("keeps an intent the queue does not already hold", () => {
    expect(dedupe([revise("a")], [revise("b")])).toEqual([
      revise("a"),
      revise("b"),
    ]);
  });

  it("drops a duplicate rather than queueing the same work twice", () => {
    // Triage runs hot and will name the same entity on consecutive passes
    // until the work is actually done. Without this the queue grows without
    // bound on a single unresolved commitment.
    expect(dedupe([revise("a")], [revise("a")])).toEqual([revise("a")]);
  });

  it("drops duplicates within one incoming batch", () => {
    expect(dedupe([], [revise("a"), revise("a")])).toEqual([revise("a")]);
  });

  it("preserves queue order — oldest first", () => {
    const out = dedupe([revise("a"), revise("b")], [revise("c")]);
    expect(out.map((i) => intentKey(i))).toEqual([
      intentKey(revise("a")),
      intentKey(revise("b")),
      intentKey(revise("c")),
    ]);
  });

  it("appends a batch in the order triage returned it", () => {
    const out = dedupe([], [revise("c"), revise("a"), revise("b")]);
    expect(out).toEqual([revise("c"), revise("a"), revise("b")]);
  });

  it("does not mutate the queue it was given", () => {
    // The caller persists the queue it holds; a hidden in-place append would
    // write intents that were never returned.
    const existing = [revise("a")];
    dedupe(existing, [revise("b")]);
    expect(existing).toEqual([revise("a")]);
  });

  it("returns the queue unchanged when nothing new arrived", () => {
    expect(dedupe([revise("a")], [])).toEqual([revise("a")]);
  });
});

describe("the loop's record key", () => {
  it("does not collide with any other storyStorage record", () => {
    // Every Story Engine record shares one flat storyStorage keyspace, so a
    // name clash would silently overwrite persisted state rather than fail.
    const others = [...Object.values(STORAGE_KEYS), ENGINE_LOOP_KEY];
    expect(others.length).toBeGreaterThan(5);
    expect(new Set(others).size).toBe(others.length);
  });
});
