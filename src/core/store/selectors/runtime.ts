import type { RootState } from "../types";

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
