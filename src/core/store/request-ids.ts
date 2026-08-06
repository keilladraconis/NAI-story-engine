/**
 * Continuation task ids.
 *
 * When a generation is cut off by the token cap the engine spends further
 * calls extending it, each registered in the runtime queue under its own id so
 * the UI can track live work. Those ids are derived from the parent request's,
 * which is what lets cancellation (global, per-request, or SEGA's Stop) reach a
 * generation that is currently inside a continuation rather than its first call.
 */

const CONTINUATION_SEPARATOR = "-cont-";

/** Task id for the nth continuation of `requestId`. */
export function continuationTaskId(requestId: string, n: number): string {
  return `${requestId}${CONTINUATION_SEPARATOR}${n}`;
}

/** True when `taskId` is `requestId` itself or one of its continuation tasks. */
export function isRequestOrContinuation(
  taskId: string,
  requestId: string,
): boolean {
  return (
    taskId === requestId ||
    taskId.startsWith(`${requestId}${CONTINUATION_SEPARATOR}`)
  );
}
