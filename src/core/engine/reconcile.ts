// §7: what history navigation has to put right, decided and not done.
//
// `historyStorage` reverts what the Engine BELIEVES. The lorebook is global
// story state and is not history-scoped, so it does not revert what the Engine
// DID. This module is the whole of the deciding; `history-sync.ts` performs it,
// and every write it performs goes through `lorebook-write.ts` like any other.
//
// Pure. No `api.v1`, no store. The caller hands over the branch's records, the
// lorebook as it stands, and the branch's threads, and gets back verdicts and a
// list of flags to flip.
//
// **Two comparisons, and only one of them is in §7's text.**
//
//   1. `reconcileWriteRecords` — an `lb:` record against the entry's live text.
//      §7 words the outcome as "matching means our edit is still the top layer
//      and can be brought in line with the branch", and **the second half of
//      that is not expressible and never was.** Task 1 stored a FINGERPRINT
//      rather than the text, deliberately, so that nothing could read the
//      record to answer "what does it say" — which is also what makes it
//      impossible to restore the branch's version from it. So this comparison
//      classifies and counts: it feeds §9.1's `∆`, and it is what would gate a
//      restore if the §5.1/§5.2 surfaces existed. It never writes text, which
//      is the safe direction in every case where the two readings differ.
//
//   2. `reconcileThreadEntries` — a thread's entry against the branch's own
//      World. This is the comparison §7 needed and did not notice, and it is
//      the ONLY thing reconciliation can actually put right, for a reason worth
//      stating plainly: `enabled` is a boolean, so a record of it can be
//      complete, where a record of text can only ever be an equality token.
//
// **And it is not a record comparison, because a record comparison cannot see
// the case.** The retire flag flip writes no text, so Task 1 records nothing —
// but widening `lb:` to carry a nullable `enabled` would not help either, and
// that is the finding. `historyStorage` inherits along ANCESTORS (§12.1): undo
// from N1 to N0 hides everything written at N1, so the record of the retire is
// exactly what the target node cannot see. The branch-truthful answer for a
// thread entry's `enabled` is not a record of what we did at all — it is the
// thread's own `status`, which lives in the `t:<id>` record and therefore does
// revert. Reconciling against the World is reconciling against the thing that
// moved.

import {
  fingerprintEntryText,
  type LorebookWriteRecord,
} from "./lorebook-write";
import type { ThreadStatus } from "../store/types";

// ───────────────────────── the record comparison (§7.3) ─────────────────────────

/** What became of one entry the Engine wrote on this branch.
 *
 *  `theirs` is deliberately the verdict for BOTH "the writer edited it" and
 *  "the Engine wrote a newer version on a branch we have navigated away from" —
 *  the two are indistinguishable from here, and they must be, because the only
 *  action either could license is overwriting text somebody else last wrote. */
export type WriteVerdict =
  /** The entry still says exactly what we wrote. */
  | "ours"
  /** Something has written over it since. Left alone (§7, §5). */
  | "theirs"
  /** The writer deleted the entry. Nothing to reconcile and nothing to count. */
  | "gone";

export type WriteReconciliation = {
  entryId: string;
  verdict: WriteVerdict;
};

/** Every `lb:` record at the target node, judged against the live lorebook.
 *
 *  The record's own `entryId` is used rather than the key it was found under —
 *  `LorebookWriteRecord` is self-identifying for exactly this reason.
 *
 *  Records in, verdicts out, one for one and in order: the caller's log reads
 *  in the order the branch wrote, and a record with no verdict would be a
 *  silently dropped write. */
export function reconcileWriteRecords(
  records: readonly LorebookWriteRecord[],
  entries: readonly LorebookEntry[],
): WriteReconciliation[] {
  const live = new Map(entries.map((entry) => [entry.id, entry]));
  return records.map((record) => {
    const entry = live.get(record.entryId);
    if (!entry) return { entryId: record.entryId, verdict: "gone" as const };
    const matches = fingerprintEntryText(entry.text) === record.textFingerprint;
    return {
      entryId: record.entryId,
      verdict: (matches ? "ours" : "theirs") as WriteVerdict,
    };
  });
}

/** §9.1's `∆`: entries the Engine has rewritten **on this branch**.
 *
 *  The slot was built as a session counter fed from the drain, which §9.1 itself
 *  records as wrong three ways — it survives a branch switch, dies on a reload,
 *  and does not move with an undo. The branch-truthful number is the count of
 *  `lb:` records at the current node, and navigation is already walking them.
 *
 *  **`theirs` counts.** The writer editing our revision afterwards does not
 *  un-revise it, and the slot is an activity level rather than a claim of
 *  ownership. **`gone` does not**: an entry the writer deleted is no longer one
 *  the Engine has rewritten, and counting it would leave `∆` claiming work
 *  against entries that are not in the book. */
export function touchedOnBranch(
  reconciliations: readonly WriteReconciliation[],
): number {
  return reconciliations.filter((r) => r.verdict !== "gone").length;
}

// ─────────────────────── the thread-entry comparison (§4.4, §4.5) ───────────────────────

/** A thread as this comparison reads it. Deliberately not `Thread`: the only
 *  two fields that matter are which entry it owns and whether it is still open,
 *  and a narrow type is what stops a later caller reaching for `anchorParagraph`
 *  in here. `Thread` satisfies it structurally, so the caller passes the World. */
export type ThreadBinding = {
  lorebookEntryId?: string;
  status: ThreadStatus;
};

/** One flag to flip, and what to flip it to. */
export type ThreadEntryFlip = {
  entryId: string;
  enabled: boolean;
};

export type ThreadEntryInput = {
  /** The lorebook as it stands. */
  entries: readonly LorebookEntry[];
  /** The entry ids filed in `SE: Threads` — the Engine's own category. */
  threadCategoryIds: readonly string[];
  /** The branch's threads, at the node just navigated to. */
  threads: readonly ThreadBinding[];
};

/** The thread entries whose `enabled` disagrees with the branch, and the value
 *  the branch says they should carry.
 *
 *  **One rule, and it settles three separate problems §4.4, §4.5 and §7 each
 *  left open.** A thread's entry is enabled exactly when a thread on this branch
 *  names it and that thread is open:
 *
 *    - **The retire flip that undo cannot reach.** The pass retires a thread —
 *      the `t:` record says satisfied, the entry is disabled. Undo past that
 *      pass and the record reverts; the entry does not. The branch says open,
 *      so the reminder comes back on.
 *    - **The thread opened on a branch the writer left.** Nothing names its
 *      entry here, so it is switched off rather than injecting a commitment
 *      this branch never raised. Redo forward and the thread names it again.
 *    - **§4.5's displaced orphan.** The cap drops a thread and cannot touch its
 *      entry, which survives unmanaged and still enabled — "proliferation
 *      control increasing proliferation", in §4.5's own words. Nothing names it
 *      on any branch, ever again, so it is switched off on the next navigation
 *      and stays off.
 *
 *  **Disabled, never deleted** (§5.2). The text, the keys and the condition all
 *  survive, the §5.2 snapshot is taken by the door on the way through, and a
 *  writer who wants the entry back flips one switch in their own lorebook. §4.4
 *  already establishes `{enabled: false}` as the Engine's non-destructive way to
 *  stop a reminder; this uses the same one.
 *
 *  **What it may touch is the Engine's own category plus what the branch's
 *  threads name.** The union, not either alone: `SE: Threads` catches the
 *  orphan, which no thread names any more, and the thread's own
 *  `lorebookEntryId` catches an entry the writer has refiled into a category of
 *  their own — CLAUDE.md's rule that Story Engine does not chase a writer's
 *  refiling is about not REWRITING `entry.category`, and it must not become a
 *  reason to lose track of an entry the World still owns.
 *
 *  **The accepted risk, stated plainly**: an entry a writer files into
 *  `SE: Threads` by hand, with no thread behind it, is indistinguishable from an
 *  orphan and will be switched off. That is one switch to undo, against the
 *  alternative of every abandoned branch leaving a permanently-injecting
 *  always-on entry — which is the accumulation §4.5 exists to prevent, arriving
 *  by the door the control opened.
 *
 *  **Open wins over satisfied** when two threads name one entry. There is no
 *  one-thread-per-entry invariant in the reducer (unlike entities), so the case
 *  is expressible; silencing a reminder a live commitment still wants is the
 *  destructive direction, and this takes the other one.
 *
 *  An entry with no `enabled` flag reads as enabled: it is optional on
 *  `LorebookEntry`, and an entry the lorebook is injecting is an enabled one.
 *  Reading undefined as disabled would write `enabled: true` onto every such
 *  entry on every navigation, which is a lorebook write per undo for nothing. */
export function reconcileThreadEntries(
  input: ThreadEntryInput,
): ThreadEntryFlip[] {
  const open = new Set<string>();
  const claimed = new Set<string>(input.threadCategoryIds);
  for (const thread of input.threads) {
    const entryId = thread.lorebookEntryId;
    if (!entryId) continue;
    claimed.add(entryId);
    if (thread.status === "open") open.add(entryId);
  }

  return input.entries
    .filter((entry) => claimed.has(entry.id))
    .filter((entry) => (entry.enabled ?? true) !== open.has(entry.id))
    .map((entry) => ({ entryId: entry.id, enabled: open.has(entry.id) }));
}
