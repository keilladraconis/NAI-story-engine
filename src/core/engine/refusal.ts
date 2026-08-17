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

/** True only for the backend's concurrency refusal — a routine collision with
 *  the writer, which is self-clearing and must never count toward a stall.
 *  Everything else, recognised or not, is false. */
export function isConcurrencyRefusal(error: unknown): boolean {
  return messageOf(error).toLowerCase().includes(REFUSAL);
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
