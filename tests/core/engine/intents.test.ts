import { describe, it, expect } from "vitest";
import {
  dedupe,
  intentKey,
  QUEUE_KEY,
  WATERMARK_KEY,
} from "../../../src/core/engine/intents";
import type { Intent } from "../../../src/core/engine/loop-machine";
import {
  INDEX_KEY,
  entityKey,
  threadKey,
  fieldKey,
} from "../../../src/core/store/persistence/keyspace";

/** The prose the pass that raised these intents read. Identity ignores it —
 *  `intentKey` is the work, not the request — so it is one constant here. */
const PROSE = "The press took Ada's left hand.";

const revise = (id: string): Intent => ({
  kind: "revise",
  entityId: id,
  prose: PROSE,
});
const open = (subject: string): Intent => ({
  kind: "open",
  subject,
  prose: PROSE,
});

describe("intentKey", () => {
  it("distinguishes kinds acting on the same subject", () => {
    expect(intentKey({ kind: "revise", entityId: "x", prose: PROSE })).not.toBe(
      intentKey({ kind: "condense", entryId: "x" }),
    );
  });

  it("gives every kind its own key for one shared id string", () => {
    // Entity ids, thread ids and lorebook entry ids are all UUIDs from the same
    // generator, so "same string, different kind" is reachable in practice.
    // Four kinds naming "x" must be four distinct pieces of work.
    const keys = [
      intentKey({ kind: "revise", entityId: "x", prose: PROSE }),
      intentKey({ kind: "open", subject: "x", prose: PROSE }),
      intentKey({ kind: "retire", threadId: "x" }),
      intentKey({ kind: "condense", entryId: "x" }),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it("keeps a subject that contains the separator decodable as its own kind", () => {
    // Triage writes the subject; nothing sanitises it. A subject of
    // "revise:x" must not become the key for revising entity x.
    expect(intentKey(open("revise:x"))).not.toBe(intentKey(revise("x")));
  });

  it("collapses subjects differing only in case", () => {
    expect(intentKey(open("The Sealed Door"))).toBe(
      intentKey(open("the sealed door")),
    );
  });

  it("collapses subjects differing only in surrounding whitespace", () => {
    // Triage returns model-authored prose; a trailing newline is not new work.
    expect(intentKey(open("  the sealed door\n"))).toBe(
      intentKey(open("the sealed door")),
    );
  });

  it("does not collapse genuinely different subjects", () => {
    expect(intentKey(open("the sealed door"))).not.toBe(
      intentKey(open("the sealed gate")),
    );
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

  it("treats subjects differing only in case or spacing as already queued", () => {
    // The same door named twice by two triage passes is one thread to open.
    expect(
      dedupe([open("the sealed door")], [open("  The Sealed Door ")]),
    ).toEqual([open("the sealed door")]);
  });

  it("keeps the subject as first queued rather than the later spelling", () => {
    const out = dedupe([open("the sealed door")], [open("The Sealed Door")]);
    expect(out).toEqual([open("the sealed door")]);
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

describe("record keys", () => {
  it("do not collide with the branch keyspace they share", () => {
    // watermark and queue live in the same historyStorage node space as the
    // index and the e:/t:/f: records, so a name clash would silently overwrite
    // persisted state rather than fail.
    const others = [
      INDEX_KEY,
      entityKey("x"),
      threadKey("x"),
      fieldKey("x"),
      WATERMARK_KEY,
      QUEUE_KEY,
    ];
    expect(new Set(others).size).toBe(others.length);
  });
});
