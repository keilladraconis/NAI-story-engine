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
// `Thread` carries `title`, `text`, `horizon`, `entityIds`, `lorebookEntryId`
// and `status` — no timestamp, no creation index, no record of when the story
// last touched it. Two of the three signals below are read off the type;
// the third, age, is read off the *array position*, which is a real signal
// (`threadCreated` appends, `threadDeleted` filters, nothing reorders, and the
// persistence index round-trips the order — `persistence/keyspace.ts`) but a
// weak one: it says which thread is older, never how much older, and never how
// long ago the prose last mentioned either.

import { PARAGRAPH_CHARS, THREAD_RANGE_CHARS } from "./thread-horizon";
import type { Thread, ThreadHorizon } from "../store/types";

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
 *     three and the one to replace when a `Thread` finally carries an anchor:
 *     position says which thread was created first, not which the story has
 *     actually stopped caring about, and those are only loosely related.
 *
 *  Exported because the ordering is the decision — the reducer only consumes
 *  its first element, but phase 6's triage prompt has to be able to tell a
 *  model which thread its next `OPEN` would displace.
 *
 *  Sorts a copy: the caller's array is store state. */
export function displacementOrder(threads: Thread[]): Thread[] {
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
 *  not touch it anyway. Its entry survives, unmanaged — and still enabled, so
 *  it goes on injecting. That is §7's reconciliation, which is phase 6's.
 *
 *  Returns the same array when nothing has to give way, so the reducer can hand
 *  it straight back and subscribers do not repaint for an unchanged list. */
export function enforceThreadCap(threads: Thread[], cap: number): Thread[] {
  // `Math.max(1, …)` rather than trusting the caller: the settings floor makes
  // a cap below 1 unreachable through the form, but a zero arriving from
  // anywhere else would empty the world on every create. `Math.floor` for the
  // same reason `normalizeEngineSettings` floors — a cap of 8.5 admits 8.
  const limit = Math.max(1, Math.floor(cap) || 1);
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
// **The anchor this needs does not exist, and inventing it was not this task's
// call.** §4.5 wants a paragraph-count expiry so an end the story quietly
// abandoned ages out rather than accumulating forever, and admits in the same
// breath that "how long since this thread was last touched" is not answerable
// from a `Thread` as specified. §4.3 deferred the arc pacing gate for the same
// missing field. So what lives here is the half that *is* decidable — the
// policy, per horizon — as a function of a count its caller supplies. Phase 6,
// which is where the Engine starts acting and therefore where a thread first
// has an event worth anchoring to, supplies the number; nothing calls this
// today, exactly as nothing yet calls `buildThreadCondition`.

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
  if (thread.status === "satisfied") return false;
  if (!Number.isFinite(paragraphsSinceTouched) || paragraphsSinceTouched < 0) {
    return false;
  }
  return paragraphsSinceTouched >= THREAD_EXPIRY_PARAGRAPHS[thread.horizon];
}
