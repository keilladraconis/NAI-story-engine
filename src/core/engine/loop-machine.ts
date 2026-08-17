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
// A single failure is NOT a stall. Concurrency refusals are routine (§3.4) and
// surfacing them would train the writer to ignore the one slot that should mean
// something, so `stalled` needs a run of them.

export type LoopPhase =
  "idle" | "assessing" | "triaging" | "acting" | "held" | "stalled";

export type Intent =
  | { kind: "revise"; entityId: string }
  | { kind: "open"; subject: string }
  | { kind: "retire"; groupId: string }
  | { kind: "condense"; entryId: string };

export type LoopState = {
  phase: LoopPhase;
  /** Unread paragraphs past the watermark, as of the last assessment. */
  backlog: number;
  /** Intents enqueued by the last pass. Phase 4 logs these; phase 6 runs them. */
  queued: number;
  /** Entities revised on this branch. Always 0 until phase 6. */
  touched: number;
  consecutiveFailures: number;
};

export type LoopEvent =
  | { type: "passRequested" }
  | { type: "assessed"; backlog: number; candidateIds: string[] }
  | { type: "triaged"; intents: Intent[] }
  | { type: "drained" }
  | { type: "budgetExhausted" }
  | { type: "failed" };

/** Enough consecutive failures that something is genuinely wrong rather than a
 *  routine collision with the writer's own generation. */
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
      const cleared = {
        ...state,
        backlog: event.backlog,
        consecutiveFailures: 0,
      };
      // Nothing new worth a generation: end the pass having spent nothing.
      if (event.backlog === 0) return { ...cleared, phase: "idle" };
      return { ...cleared, phase: "triaging" };
    }

    case "triaged":
      return event.intents.length === 0
        ? { ...state, phase: "idle", queued: 0 }
        : { ...state, phase: "acting", queued: event.intents.length };

    case "drained":
      return { ...state, phase: "idle", queued: 0 };

    case "budgetExhausted":
      return { ...state, phase: "held" };

    case "failed": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        ...state,
        consecutiveFailures,
        phase: consecutiveFailures >= STALL_THRESHOLD ? "stalled" : "idle",
      };
    }
  }
}
