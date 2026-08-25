// The pass lifecycle, as a pure reducer.
//
// assess → triage → enqueue → drain → idle (design §3.2), plus the two states
// the HUD needs a name for: `held` when the budget cannot cover the next step,
// and `stalled` when the loop cannot make progress at all.
//
// Pure by construction — no api.v1, no promises, no store. The effect in
// store/effects/engine-loop.ts owns every side effect and feeds events in here.
// That split is what makes the whole lifecycle table-testable headless.
//
// Two rules keep `stalled` meaning something. It is the HUD's `⚠`, and §9.1 is
// explicit that ordinary collisions with the writer stay invisible — a slot that
// lights up routinely is a slot the writer learns to ignore.
//
//   1. A RETRYABLE failure never counts. A concurrency refusal means the writer
//      is generating, which is normal and self-clearing (§3.4). The signal for
//      "colliding constantly" is the backlog climbing against a full budget,
//      which §9.1 lists as a compound reading — not `⚠`.
//   2. The counter clears when a pass COMPLETES, not when one starts. Clearing
//      it on `assessed` looks equivalent and is not: assessment is pure string
//      work that cannot fail, so every pass would reset the counter on its way
//      to the triage that keeps failing, and the count would oscillate 0↔1
//      forever without ever reaching the threshold.

export type LoopPhase =
  "idle" | "assessing" | "triaging" | "acting" | "held" | "stalled";

/** The queue's unit of work.
 *
 *  **Two of the four carry the prose that raised them, and that is not
 *  duplication.** §3.3 says a queued intent does not go stale because "prose
 *  does not un-happen" — true of `retire` (settled stays settled) and
 *  `condense` (length is length), and false of exactly the two whose INPUT is
 *  defined as the prose since the watermark. An intent the budget defers runs
 *  on a later pass, whose prose is different and whose watermark has already
 *  moved past the sentences that motivated it, so a `revise` reading the
 *  running pass's prose rewrites an entry against a scene its subject was never
 *  in — under a prompt that says what it leaves out is deleted. Carrying the
 *  prose is what makes §3.3's sentence true rather than aspirational: the
 *  payload is self-contained, so deferring it changes nothing about what it
 *  will do.
 *
 *  Bounded by `clampProse` at the one place intents are minted, so a queue
 *  record holds at most the same window of prose the prompt would have been
 *  given anyway — never a second, smaller clamp, which would let a revise act
 *  on prose triage never saw. `retire` and `condense` carry none of it and
 *  defer for free, which is what deferral was designed for. */
export type Intent =
  | { kind: "revise"; entityId: string; prose: string }
  | { kind: "open"; subject: string; prose: string }
  /** `why` is the STATUS to write, not a log label: expiry and triage both
   *  retire, and telling a writer their abandoned commitment was "satisfied"
   *  is the one thing the third status exists to stop. It is deliberately not
   *  part of `intentKey` — the same thread is the same work however it was
   *  named, and a queue holding both would retire it twice. */
  | { kind: "retire"; threadId: string; why: "satisfied" | "abandoned" }
  | { kind: "condense"; entryId: string };

export type LoopState = {
  phase: LoopPhase;
  /** Unread paragraphs past the watermark, as of the last assessment. */
  backlog: number;
  /** Intents enqueued by the last pass. Phase 4 logs these; phase 6 runs them. */
  queued: number;
  /** Entity entries the Engine has rewritten — §9.1's `∆`.
   *
   *  Counted from the drain's own `executed` list (`revisionsIn`), so a
   *  declined or skipped revise never lands here: this is writes, not
   *  attempts.
   *
   *  §9.1 words it as "on this branch", and the increment alone is not that —
   *  it lives in memory and accumulates for the session. So it is a live
   *  reading between navigations, and §7's reconciliation corrects it to the
   *  branch's truth whenever the branch moves: `touchedOnBranch` counts the
   *  `lb:` records at the node just navigated to and `engineTouchedRecounted`
   *  sets this. That recount belongs there rather than here, where the machine
   *  would have to become async to ask.
   *
   *  What is still session-shaped is a RELOAD, which resets this to 0 and is
   *  corrected only by the first navigation afterwards. */
  touched: number;
  consecutiveFailures: number;
};

export type LoopEvent =
  | { type: "passRequested" }
  | { type: "assessed"; backlog: number; candidateIds: string[] }
  | { type: "triaged"; intents: Intent[] }
  | { type: "drained" }
  /** How many entity entries the drain rewrote. Separate from `drained`
   *  because a drain that ran out of budget mid-queue reports
   *  `budgetExhausted` instead and may still have revised something first —
   *  hanging the count on one of them would lose it on the other. */
  | { type: "revised"; count: number }
  | { type: "budgetExhausted" }
  /** `retryable` comes from refusal.ts's classifier. True means a routine
   *  concurrency collision, which must not count toward a stall. */
  | { type: "failed"; retryable: boolean };

/** Enough consecutive non-retryable failures that something is genuinely wrong.
 *  Retryable ones never get here. */
const STALL_THRESHOLD = 4;

export const initialLoopState: LoopState = {
  phase: "idle",
  backlog: 0,
  queued: 0,
  touched: 0,
  consecutiveFailures: 0,
};

/** A pass may start from a resting phase only. `held` and `stalled` both count
 *  as resting: the budget may have recovered, or whatever was blocking progress
 *  may have cleared, and finding out costs nothing. */
export function canStartPass(state: LoopState): boolean {
  return (
    state.phase === "idle" ||
    state.phase === "held" ||
    state.phase === "stalled"
  );
}

export function loopReducer(state: LoopState, event: LoopEvent): LoopState {
  switch (event.type) {
    case "passRequested":
      // Identity, not a copy, when a pass is already under way — the ⚡'s
      // re-entry guard reads this and a new object would look like progress.
      return canStartPass(state) ? { ...state, phase: "assessing" } : state;

    case "assessed": {
      const assessed = { ...state, backlog: event.backlog };
      // Nothing new worth a generation: the pass ends here having spent
      // nothing, and ending is completing — so the counter clears.
      if (event.backlog === 0) {
        return { ...assessed, phase: "idle", consecutiveFailures: 0 };
      }
      // Still mid-pass. Deliberately does NOT clear consecutiveFailures: see
      // rule 2 in the header.
      return { ...assessed, phase: "triaging" };
    }

    case "triaged":
      // Triage returned, so the pass got past the step that actually fails —
      // and the backlog it was assessing has now been read. Zeroing it here is
      // what makes the slot mean "unread" rather than "however much the last
      // generation produced": a wakeup only fires after a generation, so a
      // backlog that merely carried forward would never once read 0 in normal
      // use, and the writer could not tell "kept up" from "three behind".
      return event.intents.length === 0
        ? {
            ...state,
            phase: "idle",
            queued: 0,
            backlog: 0,
            consecutiveFailures: 0,
          }
        : {
            ...state,
            phase: "acting",
            queued: event.intents.length,
            backlog: 0,
            consecutiveFailures: 0,
          };

    case "revised":
      // Identity when there is nothing to add: the HUD subscribes to this
      // slice, and every pass would otherwise repaint it for a zero.
      return event.count === 0
        ? state
        : { ...state, touched: state.touched + event.count };

    case "drained":
      return {
        ...state,
        phase: "idle",
        queued: 0,
        backlog: 0,
        consecutiveFailures: 0,
      };

    case "budgetExhausted":
      // Not a failure — a legitimate hold. Leaves the counter alone in both
      // directions, and leaves `backlog` standing: nothing was read, so the
      // climb is exactly the signal §9.1 wants read against the budget slot.
      return { ...state, phase: "held" };

    case "failed": {
      // A routine collision is not evidence of anything. Rest, and let the
      // backlog carry the signal — it stays where assessment left it, because
      // a pass that failed read nothing.
      if (event.retryable) return { ...state, phase: "idle" };
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        ...state,
        consecutiveFailures,
        phase: consecutiveFailures >= STALL_THRESHOLD ? "stalled" : "idle",
      };
    }
  }
}
