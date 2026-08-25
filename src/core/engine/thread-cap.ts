// Proliferation control (§4.5): which thread gives way at the ceiling, and when
// one the story quietly walked away from ages out.
//
// Nothing about the forgetting detector stops triage opening an entry for every
// glance and half-promise, and each thread is a lorebook entry that injects the
// moment the story stops carrying it. Unbounded growth would slowly poison the
// context the Engine exists to improve, so a cap bites — and a cap has to know
// what to sacrifice.
//
// Pure. No `api.v1`, no store, no lorebook. The reducer is where the cap is
// *enforced*, because an invariant a new callsite cannot bypass has to live
// there (the same argument as one-entity-per-lorebook-entry in
// `slices/world.ts`); this file is where it is *decided*, because narrative
// weight is not a reducer's business and a decision worth arguing about is
// worth testing on its own.
//
// **The information this can decide with is thin, and that is the finding.** A
// `Thread` carried `title`, `text`, `horizon`, `entityIds`, `lorebookEntryId`
// and `status` — no timestamp, no creation index, no record of when the story
// last touched it. Two of the three signals below are read off the type;
// the third, age, is read off the *array position*, which is a real signal
// (`threadCreated` appends, `threadDeleted` filters, nothing reorders, and the
// persistence index round-trips the order — `persistence/keyspace.ts`) but a
// weak one: it says which thread is older, never how much older, and never how
// long ago the prose last mentioned either.
//
// Phase 6 added `anchorParagraph`, which answers that question — but only for a
// thread the ENGINE opened or renewed; one the writer made by hand carries
// `null`, because nothing on that path knows the branch's paragraph count. So
// it is a datum expiry can decline on (`isThreadExpired`, below) and not one
// the displacement order can sort by.

import { mentionsName } from "./assess";
import { PARAGRAPH_CHARS, THREAD_RANGE_CHARS } from "./thread-horizon";
import type { Thread, ThreadHorizon, ThreadStatus } from "../store/types";

/** The two fields the displacement order actually reads.
 *
 *  Generic rather than `Thread` because the reducer is not the only caller any
 *  more: the triage manifest carries a projection of a thread — id, title,
 *  text, horizon, status — and it has to be able to tell a model which thread
 *  its next `OPEN` would cost. A second implementation of the ordering for the
 *  prompt's benefit is a second implementation that will disagree with the one
 *  the reducer enforces, and a prompt that names the wrong victim is worse than
 *  one that names none. */
export type Displaceable = { horizon: ThreadHorizon; status: ThreadStatus };

/** How readily a horizon is given up, ascending. A point is a detail the story
 *  was expected to pick up in the same beat; an arc is its spine. Sacrificing
 *  the smallest commitment first is the only ordering that does not risk
 *  spending the cap on the story's shape to keep a passing promise. */
const HORIZON_WEIGHT: Record<ThreadHorizon, number> = {
  point: 0,
  plot: 1,
  arc: 2,
};

/** The threads in the order they would be given up, weakest first.
 *
 *  Three keys, in order:
 *
 *  1. **Satisfied before open.** A satisfied thread is a finished commitment
 *     holding a slot for nothing — §4.4 has already disabled its entry, so it
 *     costs no context, but it costs a place in the list and in every triage
 *     manifest. Nothing open should go while one of these is still standing.
 *  2. **Shortest horizon first.** See `HORIZON_WEIGHT`.
 *  3. **Oldest first**, meaning lowest array index. This is the weakest of the
 *     three: position says which thread was created first, not which the story
 *     has actually stopped caring about, and those are only loosely related.
 *     Phase 6 gave `Thread` the `anchorParagraph` this wanted, but only the
 *     Engine writes it — a thread the writer made by hand carries `null` — so
 *     ordering by it would sort the writer's own threads by nothing at all.
 *     Replacing this key is a decision for whoever makes the anchor
 *     unconditional, not a mechanical swap.
 *
 *  Exported because the ordering is the decision — the reducer only consumes
 *  its first element, but the triage prompt has to be able to tell a model
 *  which thread its next `OPEN` would displace (`displacedByNextThread`).
 *
 *  Sorts a copy: the caller's array is store state. */
export function displacementOrder<T extends Displaceable>(threads: T[]): T[] {
  return threads
    .map((thread, index) => ({ thread, index }))
    .sort(
      (a, b) =>
        Number(a.thread.status === "open") -
          Number(b.thread.status === "open") ||
        HORIZON_WEIGHT[a.thread.horizon] - HORIZON_WEIGHT[b.thread.horizon] ||
        a.index - b.index,
    )
    .map((entry) => entry.thread);
}

/** The cap as everything downstream must read it.
 *
 *  `Math.max(1, …)` rather than trusting the caller: the settings floor makes a
 *  cap below 1 unreachable through the form, but a zero arriving from anywhere
 *  else would empty the world on every create. `Math.floor` for the same reason
 *  `normalizeEngineSettings` floors — a cap of 8.5 admits 8.
 *
 *  Exported so the triage prompt states the same ceiling the reducer enforces
 *  rather than a rounded-differently copy of it. */
export function effectiveCap(cap: number): number {
  return Math.max(1, Math.floor(cap) || 1);
}

/** Which threads a create would cost right now — empty while there is room.
 *
 *  `threads` is the list as it stands, WITHOUT the newcomer: this answers the
 *  question before the create, which is the question triage is asked (§4.5,
 *  "justify a new thread against the cap"). `enforceThreadCap` answers the same
 *  question after, from the same ordering, so the two cannot disagree about who
 *  goes — `thread-cap.test.ts` asserts that against the reducer directly.
 *
 *  More than one name comes back only when the cap has been lowered under a
 *  list that was already legal, which is exactly when a create brings the list
 *  all the way down rather than draining it one at a time. */
export function displacedByNextThread<T extends Displaceable>(
  threads: T[],
  cap: number,
): T[] {
  const overflow = threads.length + 1 - effectiveCap(cap);
  return overflow <= 0 ? [] : displacementOrder(threads).slice(0, overflow);
}

/** The thread list as it should stand after a create, given the cap.
 *
 *  `threads` is the list with the newcomer already appended — which is how the
 *  reducer sees it — and **the last element is never the one displaced.** §4.5
 *  says displace rather than add: the newest thread is the commitment the story
 *  just raised, and a create that silently undid itself would read as a broken
 *  button rather than as a cap. So room is made among the others, however weak
 *  the newcomer is by `displacementOrder`.
 *
 *  The postcondition is flat: after any create, `threads.length <= cap`. That
 *  matters when the cap has just been *lowered* — the setting does not
 *  retroactively delete anything, which would be a settings change eating a
 *  writer's work, but it does bite in full on the next create rather than
 *  draining one thread at a time towards a number it would never reach.
 *
 *  A displaced thread is dropped from the store, not deleted from the lorebook:
 *  §5.2 says the writer's lorebook is never destroyed, and this function could
 *  not touch it anyway. Its entry survives, unmanaged — and would still be
 *  enabled, so it would go on injecting. The `open` arm in `execute.ts` is
 *  where that is answered, and it is the only place that answers it.
 *
 *  Returns the same array when nothing has to give way, so the reducer can hand
 *  it straight back and subscribers do not repaint for an unchanged list. */
export function enforceThreadCap(threads: Thread[], cap: number): Thread[] {
  const limit = effectiveCap(cap);
  if (threads.length <= limit) return threads;

  const newest = threads[threads.length - 1];
  const doomed = new Set(
    displacementOrder(threads.slice(0, -1))
      .slice(0, threads.length - limit)
      .map((thread) => thread.id),
  );
  // Filtered rather than rebuilt from `displacementOrder`, so the survivors
  // keep the insertion order the age signal above is read from.
  return [...threads.filter((t) => t !== newest && !doomed.has(t.id)), newest];
}

// ──────────────────────────────── expiry ────────────────────────────────
//
// **Two halves, and they arrived a task apart.** §4.5 wants a paragraph-count
// expiry so an end the story quietly abandoned ages out rather than
// accumulating forever, and admitted in the same breath that "how long since
// this thread was last touched" was not answerable from a `Thread` as
// specified. So phase 5 built the half that *was* decidable — the policy, per
// horizon (`isThreadExpired`), as a function of a count its caller supplies —
// and phase 6's Task 5 added the anchor (`Thread.anchorParagraph`) and
// `Assessment.paragraphCount` to compare it against. `expiredThreads` at the
// bottom is the join, and the pass turns what it returns into §4.4's flag flip.
//
// **What expiry does is retire, not delete.** Deleting a thread on a timer
// destroys the writer's record of a commitment AND leaves its lorebook entry
// behind — §5.2 forbids removing that — still enabled, still injecting: §4.5's
// own orphan, arriving by the door that was supposed to prevent it.
// Retirement instead is the `{enabled: false}` flip of §4.4: reversible by
// hand, visible in the World list, free at 0 output tokens (§3.3), and it makes
// the thread the first slot `displacementOrder` reclaims — which is the
// proliferation control §4.5 asked for. Offering it to triage instead was the
// third option and is the worst of the three: it spends ~150 tokens asking a
// model about something this measurement answers for nothing, and the triage
// prompt forbids the answer anyway ("Never RETIRE a thread to make room. RETIRE
// means the prose settled it").

/** How many of its own forgetting windows a thread is given before the story is
 *  taken to have abandoned it.
 *
 *  Ten. The condition's `range` already encodes how long a horizon may go quiet
 *  before the reminder starts firing; expiry is the point at which the reminder
 *  has been firing across ten full windows and the prose still has not come
 *  back to it. That is a story that has moved on, not one that is between
 *  scenes. A smaller multiple would retire threads the writer is circling; a
 *  larger one is the accumulation §4.5 is about. */
export const EXPIRY_WINDOWS = 10;

/** Ten windows, in paragraphs — 25 / 100 / 300 for point / plot / arc, against
 *  `thread-horizon.ts`'s ~400-character paragraph.
 *
 *  Derived rather than written out so a range and its expiry cannot drift into
 *  disagreeing about what a horizon means: roughly three scenes for a point, a
 *  chapter for a plot, and most of a novella for an arc. */
export const THREAD_EXPIRY_PARAGRAPHS: Record<ThreadHorizon, number> =
  Object.freeze({
    point: (EXPIRY_WINDOWS * THREAD_RANGE_CHARS.point) / PARAGRAPH_CHARS,
    plot: (EXPIRY_WINDOWS * THREAD_RANGE_CHARS.plot) / PARAGRAPH_CHARS,
    arc: (EXPIRY_WINDOWS * THREAD_RANGE_CHARS.arc) / PARAGRAPH_CHARS,
  });

/** Whether a thread has been left untouched long enough to have been abandoned.
 *
 *  `paragraphsSinceTouched` is the datum a `Thread` does not carry — see the
 *  block above. The caller owns it; this owns what it means.
 *
 *  A satisfied thread never expires: satisfaction is not abandonment, and a
 *  finished thread already leaves by being the first slot the cap reclaims.
 *  Expiring it too would be a second retirement of the same commitment.
 *
 *  A count that is not a finite, non-negative number is a broken anchor, not an
 *  ancient thread — undo moves the story backwards past a recorded position,
 *  and a missing record reads as whatever the caller defaulted it to. Expiry is
 *  a destructive verdict, so it declines to reach one on a number it cannot
 *  trust, the same way `normalizeEngineSettings` declines to read intent into a
 *  value that carries none. */
export function isThreadExpired(
  thread: Thread,
  paragraphsSinceTouched: number,
): boolean {
  // Both retired readings, not just `satisfied`: an abandoned thread has
  // already aged out once and re-expiring it would rewrite the same verdict
  // onto the same thread on every pass.
  if (thread.status !== "open") return false;
  if (!Number.isFinite(paragraphsSinceTouched) || paragraphsSinceTouched < 0) {
    return false;
  }
  return paragraphsSinceTouched >= THREAD_EXPIRY_PARAGRAPHS[thread.horizon];
}

/** The threads the story has walked away from, given the branch's paragraph
 *  count — `isThreadExpired`'s caller, at last.
 *
 *  **The null is branched on here, deliberately.** `isThreadExpired` takes a
 *  number and cannot express "unknown": `paragraphCount - null` is
 *  `paragraphCount - 0` in JavaScript, which its guard accepts as a perfectly
 *  good very large count and expires on. So the one datum that must never reach
 *  it is the one the arithmetic would quietly launder, and the decline lives
 *  above the arithmetic rather than inside it.
 *
 *  **Only the Engine anchors, so only the Engine's threads age.** That
 *  asymmetry is the right default and a real gap at the same time. Right,
 *  because expiry silences a reminder and a defaulted 0 would retire every
 *  hand-made thread on the first pass after it was created, in any story past
 *  the horizon's window — the worst available failure, arriving without the
 *  writer doing anything. A gap, because §4.5's proliferation control then does
 *  not reach the threads a writer creates by hand at all. The fix is not a
 *  default: it is anchoring on the World's "+ New Thread" too, which needs that
 *  path to await a document scan before it dispatches. Until then, `null` says
 *  what is true.
 *
 *  Every expired thread, not the first. Retirement is §3.3's zero-token flag
 *  flip, so there is no budget reason to trickle them out one per pass the way
 *  `nextCondense` must — and a thread left un-retired for another pass goes on
 *  injecting a reminder for a commitment the story dropped.
 *
 *  Pure, like everything else in this file: what a caller DOES with an expired
 *  thread (§4.4's flag flip, via a `retire` intent) is the pass's. */
export function expiredThreads(
  threads: Thread[],
  paragraphCount: number,
): Thread[] {
  return threads.filter(
    (thread) =>
      thread.anchorParagraph !== null &&
      isThreadExpired(thread, paragraphCount - thread.anchorParagraph),
  );
}

// ──────────────────────────────── renewal ────────────────────────────────
//
// **Expiry without renewal is a fixed TTL from creation, and that is the
// opposite of what §4.5 asks for.** The section names renewal and, until phase
// 6's correction, defined it as one thing only: an `open` whose subject already
// names a thread moves that thread's anchor instead of minting a second one
// (`findThreadBySubject`, in `thread-bind.ts`). That path almost never fires.
// `TRIAGE_SYSTEM` tells the model to act on what the new prose establishes and
// NOT on what the manifest already records — so a thread already on the list is
// precisely what triage is instructed not to raise again, and the only renewal
// the Engine had was waiting for an `OPEN` that does not come. Expiry then
// retires threads the story is actively honouring.
//
// So renewal is prose-grounded as well, and this is that half: **a thread whose
// subject the pass just read is alive, and its anchor moves.** The evidence is
// free — `assess` already computes `candidateIds` — and it is the same evidence
// the entry's own detector runs on.
//
// **Only the threads the prose actually touched.** Renewing every thread on
// every pass was the wider reading and it is rejected on the same grounds phase
// 6 rejected it elsewhere: the anchor rides the `t:<id>` history record and
// copy-on-write is per key per node (§6.2), so that would copy every thread
// record onto every node the Engine writes at, and rebuild every thread's
// lorebook condition every pass (`threadAnchorSet` is a rebuild trigger). What
// this returns is bounded by what the writer just wrote.

/** What one pass read, as renewal needs to read it: which entities the new
 *  prose plausibly mentions, and the prose itself.
 *
 *  A projection of `Assessment` rather than the thing, so this file stays pure
 *  and free of the pass's shape — and so a caller cannot hand in the whole
 *  document where the pass's unread tail was meant. */
export type ProseRead = {
  candidateIds: readonly string[];
  newText: string;
};

/** The threads whose anchor should move to `paragraph` — those the prose the
 *  pass just read demonstrates the story is still carrying.
 *
 *  **Alive means what the detector means by alive.** `threadSubjects`
 *  (`thread-condition.ts`) calls a thread alive when its title OR one of its
 *  cast's names is on the page, and this asks the same question of the same
 *  prose. A narrower rule here would let the Engine retire a thread whose own
 *  lorebook entry is still, correctly, staying quiet — the Engine and the entry
 *  disagreeing about the one fact they are both reading off the page. The cast
 *  carries it, as §4.1 says; the title rides along and rarely matches, which is
 *  exactly its role in the detector too.
 *
 *  Matched with `mentionsName`, which is `assess`'s own matcher and
 *  `castFromSubject`'s: "is Ada in this string" has one answer in this codebase.
 *
 *  **A satisfied thread is not renewed.** Renewal exists to feed expiry, expiry
 *  never reaches a satisfied thread (`isThreadExpired`), and its entry is
 *  already disabled (§4.4) so the pace gate the anchor is baked into governs
 *  nothing. The write would buy nothing and cost a `t:` record copied onto the
 *  node plus a rebuilt condition on a disabled entry, every pass its cast is
 *  mentioned. `findThreadBySubject` does renew a satisfied thread, and the
 *  asymmetry is deliberate: there the anchor move is a byproduct of not minting
 *  a duplicate, and it happens once per matching subject rather than on every
 *  pass.
 *
 *  **A thread already anchored here is not renewed either.** A pass that reads
 *  an extension of the trailing section reads new prose without adding a
 *  paragraph, so the same count arrives twice; nothing to move is nothing to
 *  write, and the dispatch would rebuild a condition to the value it already
 *  holds.
 *
 *  **An unanchored thread the prose touched IS anchored**, and this is the one
 *  place §4.5's "only the Engine's threads age" asymmetry is narrowed. The
 *  reason that asymmetry exists is that a DEFAULT of 0 would read as "abandoned
 *  since paragraph 0" and retire the writer's threads on the first pass. This
 *  is not a default: it is evidence, and the anchor lands at the paragraph the
 *  story was demonstrably carrying the thread at, so the thread gets its whole
 *  expiry window from that moment. `null` goes on meaning "we know nothing",
 *  which is why a hand-made thread the prose never mentions still never ages.
 *
 *  Pure, like everything else here: the dispatch and the log are the pass's. */
export function renewedThreads(
  threads: Thread[],
  prose: ProseRead,
  paragraph: number,
): Thread[] {
  const read = new Set(prose.candidateIds);
  return threads.filter(
    (thread) =>
      thread.status === "open" &&
      thread.anchorParagraph !== paragraph &&
      (thread.entityIds.some((id) => read.has(id)) ||
        mentionsName(prose.newText, thread.title)),
  );
}
