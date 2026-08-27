// Telling a routine collision apart from a real failure.
//
// The backend refuses concurrent requests with an error carrying
// `message: "A generation is already in progress"` — no status code, no error
// code, no subclass — so message matching is the only option available (§3.4,
// measured in §12.0).
//
// Anything unrecognised is NON-retryable. Not because a retry is expensive (a
// refusal is free — §12.0) but because retrying a failure we do not understand
// is unlikely to help, and the attempt bound is the real guard against spinning.
//
// Pure by construction — no api.v1, no promises, no store. The engine effect
// catches the rejection and asks these two questions about it.
//
// Match on SHAPE, not on prototype. The §12.0 probe printed the rejection's own
// property names and got `message=… | name=Error`; `name` is inherited on a real
// Error, so the value it caught already carried `name` as an own property. On top
// of that, a rejection crossing the host↔QuickJS boundary need not be an instance
// of the sandbox's own Error constructor. An `instanceof` gate that missed would
// classify every routine collision as a real failure and light the HUD's ⚠ during
// ordinary writing — the exact outcome §9.1 forbids. Reading the message off
// anything that carries one widens what can be READ; the message match, unchanged,
// is still the only thing that makes a failure retryable.

const REFUSAL = "generation is already in progress";

/** GenX 0.5.0's fast rejection, read by SHAPE for the same reason the message
 *  match below is: the bundle inlines GenX, so `instanceof FastRejectionError`
 *  would fail across a duplicated module. Upstream anticipated that and brands
 *  the error with `isFastRejection: true` precisely so a consumer can avoid the
 *  prototype — this reads the brand and the reason, nothing else. */
function fastRejectionReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const branded = error as { isFastRejection?: unknown; reason?: unknown };
  if (branded.isFastRejection !== true) return null;
  return typeof branded.reason === "string" ? branded.reason : null;
}

/** Total attempts one firing may make: the original call plus its retries. So
 *  `backoffMs` schedules `MAX_ATTEMPTS - 1` waits and then gives up. */
export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 400;

/** The message an arbitrary rejection carries, or "" if it carries none. Never
 *  throws: this runs inside the effect's catch, where a throw would take out the
 *  pass it was called to describe. */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string") return message;
  }
  return "";
}

/** True for a routine collision with the writer — self-clearing, never a stall,
 *  and worth waiting a moment for.
 *
 *  Two arrivals, one event. The backend refuses a concurrent request after the
 *  call goes out; GenX's `fastRejection` refuses one *before* it does, when a
 *  task is already executing or queued. The Engine's response is the same
 *  either way, so they answer the same question. Everything else, recognised or
 *  not, is false. */
export function isConcurrencyRefusal(error: unknown): boolean {
  if (fastRejectionReason(error) === "busy") return true;
  return messageOf(error).toLowerCase().includes(REFUSAL);
}

/** True when GenX declined for want of budget rather than queueing behind it.
 *
 *  **Not the same as a collision, and the difference is the retry.** A collision
 *  clears in milliseconds, so `backoffMs` waits and tries again. A bucket
 *  refills over minutes and only while the writer is interacting (§3.3), so
 *  waiting inside the pass would hold the node and the re-entry guard for
 *  nothing. This ends the pass; the next wakeup is the retry. */
export function isBudgetHold(error: unknown): boolean {
  return fastRejectionReason(error) === "budget";
}

/** Delay before retry number `attempt`, or null to give up — at which point the
 *  intent is requeued for the next wakeup rather than retried again.
 *
 *  **Retries are numbered from 1**: `backoffMs(1)` is the wait before the first
 *  retry, i.e. the second attempt overall. An attempt number outside that
 *  contract (0 or below, fractional, NaN, infinite) gives up rather than being
 *  clamped — a refusal is free (§12.0) so giving up costs only latency, whereas
 *  clamping would silently paper over a caller that counted from 0 and NaN would
 *  otherwise reach `api.v1.timers` as a delay. */
export function backoffMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  if (attempt >= MAX_ATTEMPTS) return null;
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}
