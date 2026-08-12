import type { RootState } from "../types";

/** True while a specific request id is active, queued, or SEGA-active.
 *
 *  Requests keyed off a stable id (entity summary, lorebook content/keys, thread
 *  summary) can be recognised as repeats, unlike the uuid-per-submission
 *  foundation requests below. Effects that mint one of these ids check here
 *  before queueing, so a repeat dispatch — a doubled tap, or a second click
 *  landing inside an effect's own `await` — is dropped rather than queued twice
 *  under the same id. */
export function isRequestActive(
  runtime: RootState["runtime"],
  requestId: string,
): boolean {
  return (
    runtime.activeRequest?.id === requestId ||
    runtime.queue.some((q) => q.id === requestId) ||
    runtime.sega.activeRequestIds.includes(requestId)
  );
}

/** Every foundation field that can be generated on its own request. Wider than
 *  the UI's `FoundationFieldId` — `worldState` has no card, only an effect. */
export type FoundationTarget =
  "shape" | "intent" | "worldState" | "contract" | "attg" | "style";

/**
 * True while a foundation generation for `field` is queued or already running.
 *
 * Foundation requests are minted with a fresh uuid per submission, so nothing
 * downstream can tell a repeat from a genuine second request — two of them just
 * generate the same field twice and race to write it. The target is the stable
 * identity, so dedupe on that: the effect refuses to submit while one is in
 * flight, and the ⚡ buttons dim off the same predicate.
 */
export function isFoundationRequestPending(
  state: RootState,
  field: FoundationTarget,
): boolean {
  const { queue, activeRequest } = state.runtime;
  return (
    queue.some((r) => r.type === "foundation" && r.targetId === field) ||
    (activeRequest?.type === "foundation" && activeRequest.targetId === field)
  );
}
