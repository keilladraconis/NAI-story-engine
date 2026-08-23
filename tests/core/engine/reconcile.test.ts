// §7's two comparisons, both pure.
//
// The first is the one §7 writes down: an `lb:` record against the entry's live
// text. The second is the one §7 needed and did not notice — a thread's entry
// against the branch's own World — and the tests below are as much about what
// it refuses to touch as about what it flips.
import { describe, it, expect } from "vitest";
import {
  reconcileThreadEntries,
  reconcileWriteRecords,
  touchedOnBranch,
  type ThreadBinding,
} from "../../../src/core/engine/reconcile";
import {
  fingerprintEntryText,
  type LorebookWriteRecord,
} from "../../../src/core/engine/lorebook-write";

function record(entryId: string, text: string): LorebookWriteRecord {
  return { entryId, textFingerprint: fingerprintEntryText(text) };
}

function entry(over: Partial<LorebookEntry> & { id: string }): LorebookEntry {
  return { enabled: true, ...over };
}

function verdicts(
  records: LorebookWriteRecord[],
  entries: LorebookEntry[],
): Record<string, string> {
  return Object.fromEntries(
    reconcileWriteRecords(records, entries).map((r) => [r.entryId, r.verdict]),
  );
}

describe("reconcileWriteRecords — is our edit still the top layer?", () => {
  it("calls an entry ours when its text is what we recorded writing", () => {
    expect(
      verdicts(
        [record("a", "Ada keeps the letter.")],
        [entry({ id: "a", text: "Ada keeps the letter." })],
      ),
    ).toEqual({ a: "ours" });
  });

  it("calls it theirs when the writer has edited since", () => {
    expect(
      verdicts(
        [record("a", "Ada keeps the letter.")],
        [entry({ id: "a", text: "Ada burned the letter." })],
      ),
    ).toEqual({ a: "theirs" });
  });

  it("hears a one-character edit", () => {
    expect(
      verdicts([record("a", "Ada.")], [entry({ id: "a", text: "Adam." })]),
    ).toEqual({ a: "theirs" });
  });

  it("calls it gone when the writer deleted the entry", () => {
    expect(verdicts([record("a", "x")], [])).toEqual({ a: "gone" });
  });

  it("reads an entry with no text and one with empty text the same", () => {
    // `LorebookEntry.text` is optional and the two say the same thing. Reading
    // the difference as a hand-edit would leave reconciliation calling an entry
    // nobody touched theirs.
    expect(verdicts([record("a", "")], [entry({ id: "a" })])).toEqual({
      a: "ours",
    });
  });

  it("ignores entries no record names", () => {
    expect(verdicts([], [entry({ id: "a", text: "x" })])).toEqual({});
  });

  it("answers for every record, in the order they arrived", () => {
    const rs = [record("a", "1"), record("b", "2")];
    const es = [entry({ id: "b", text: "2" }), entry({ id: "a", text: "no" })];
    expect(reconcileWriteRecords(rs, es).map((r) => r.entryId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("touchedOnBranch — §9.1's ∆, from the branch rather than the session", () => {
  it("counts the entries the Engine wrote on this branch", () => {
    const rs = [record("a", "1"), record("b", "2")];
    const es = [entry({ id: "a", text: "1" }), entry({ id: "b", text: "no" })];
    // Ours and theirs alike: the writer editing our revision afterwards does
    // not un-revise it, and §9.1's slot is an activity level.
    expect(touchedOnBranch(reconcileWriteRecords(rs, es))).toBe(2);
  });

  it("does not count an entry the writer deleted", () => {
    const rs = [record("a", "1"), record("b", "2")];
    const es = [entry({ id: "a", text: "1" })];
    expect(touchedOnBranch(reconcileWriteRecords(rs, es))).toBe(1);
  });

  it("is zero on a branch the Engine never wrote to", () => {
    expect(touchedOnBranch(reconcileWriteRecords([], []))).toBe(0);
  });
});

describe("reconcileThreadEntries — the flag the lorebook does not revert", () => {
  const thread = (
    lorebookEntryId: string | undefined,
    status: ThreadBinding["status"] = "open",
  ): ThreadBinding => ({ lorebookEntryId, status });

  const flips = (
    entries: LorebookEntry[],
    threadCategoryIds: string[],
    threads: ThreadBinding[],
  ) => reconcileThreadEntries({ entries, threadCategoryIds, threads });

  it("re-enables the entry of a thread this branch still holds open", () => {
    // The undo §7 exists for: the `t:` record reverted and the thread is open
    // again, while its lorebook entry stayed disabled because the lorebook is
    // not history-scoped.
    expect(
      flips([entry({ id: "t", enabled: false })], ["t"], [thread("t")]),
    ).toEqual([{ entryId: "t", enabled: true }]);
  });

  it("disables the entry of a thread this branch calls satisfied", () => {
    expect(
      flips(
        [entry({ id: "t", enabled: true })],
        ["t"],
        [thread("t", "satisfied")],
      ),
    ).toEqual([{ entryId: "t", enabled: false }]);
  });

  it("disables a thread entry no thread on this branch answers for", () => {
    // Two shapes at once: the orphan the cap displaced (§4.5) and the thread
    // opened on a branch the writer has navigated away from. Both leave an
    // always-on entry injecting a reminder for a commitment this branch has
    // never heard of.
    expect(flips([entry({ id: "t", enabled: true })], ["t"], [])).toEqual([
      { entryId: "t", enabled: false },
    ]);
  });

  it("writes nothing when the branch and the lorebook already agree", () => {
    expect(
      flips(
        [entry({ id: "a", enabled: true }), entry({ id: "b", enabled: false })],
        ["a", "b"],
        [thread("a"), thread("b", "satisfied")],
      ),
    ).toEqual([]);
  });

  it("leaves every entry outside the Engine's thread category alone", () => {
    // The whole of the writer's lorebook is in `entries`; the Engine's claim is
    // its own category and the entries its own threads name.
    expect(flips([entry({ id: "mine", enabled: true })], [], [])).toEqual([]);
  });

  it("still reconciles a thread entry the writer refiled elsewhere", () => {
    // A writer may move the Engine's entry into a category of their own. The
    // branch's thread still names it, and that naming is the stronger claim.
    expect(
      flips([entry({ id: "t", enabled: false })], [], [thread("t")]),
    ).toEqual([{ entryId: "t", enabled: true }]);
  });

  it("reads an entry with no enabled flag as enabled", () => {
    // `enabled` is optional on `LorebookEntry`, and an entry the lorebook is
    // injecting is an enabled one. Reading undefined as disabled would write a
    // pointless `enabled: true` to every such entry on every navigation.
    expect(flips([{ id: "t" }], ["t"], [thread("t")])).toEqual([]);
  });

  it("ignores a thread with no entry behind it", () => {
    expect(
      flips([entry({ id: "t", enabled: true })], [], [thread(undefined)]),
    ).toEqual([]);
  });

  it("keeps an entry enabled while any thread naming it is open", () => {
    // The one-entity-per-entry invariant does not cover threads, so two threads
    // over one entry is expressible. Open wins: silencing a reminder a live
    // commitment still wants is the destructive direction.
    expect(
      flips(
        [entry({ id: "t", enabled: true })],
        ["t"],
        [thread("t", "satisfied"), thread("t", "open")],
      ),
    ).toEqual([]);
  });

  it("names an entry once however many times the category lists it", () => {
    expect(flips([entry({ id: "t", enabled: true })], ["t", "t"], [])).toEqual([
      { entryId: "t", enabled: false },
    ]);
  });
});
