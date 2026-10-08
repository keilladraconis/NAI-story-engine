// Pure, framework-free selectors for the World display. Mirrors SUI
// SeWorldSection._selectBody and SeEntityCard's status logic, but store-only
// (no async lorebook reads this slice). Unit-tested headless — no icon imports.

import { isRequestActive } from "../../../core/store/selectors/runtime";
import {
  entitySummaryRequestId,
  entitySummaryBindRequestId,
  lorebookContentRequestId,
  lorebookKeysRequestId,
} from "../../../core/keys";
import type { RootState, WorldEntity, Thread } from "../../../core/store";

/** Visible World body: every thread, plus every entity the World shows.
 *
 *  **Threads no longer group the World.** An entity used to be hidden from the
 *  list whenever some thread cast it, which made it findable only by expanding
 *  the right thread — and a thread's cast is an activation input (who its
 *  entry's `advancedConditions` wait to see on stage, see
 *  `thread-condition.ts`), not a place entities live. Casting Ada in "the succession" should not remove Ada from the
 *  World. So `loose` is now simply the entities the World lists; the name is
 *  kept because every caller reads it positionally and the meaning it carries —
 *  "what the World shows" — is the one it always should have had. */
export function selectWorldBody(
  entitiesById: Record<string, WorldEntity>,
  threads: Thread[],
): { threads: Thread[]; loose: WorldEntity[] } {
  const loose = Object.values(entitiesById);
  return { threads, loose };
}

/** Threads split into the working set and the fold.
 *
 *  Open threads are what the story can still change; concluded ones have
 *  settled into their cast's own entries. They accumulate — a long story
 *  concludes many — and twenty finished rows bury the three that matter, so
 *  they fold under their own heading, one click away.
 *
 *  Order within each list is the stored order. The World lists threads as they
 *  were created and partitioning must not re-sort them under a reaching finger. */
export function partitionThreads(threads: Thread[]): {
  open: Thread[];
  concluded: Thread[];
} {
  const open: Thread[] = [];
  const concluded: Thread[] = [];
  for (const thread of threads) {
    (thread.status === "open" ? open : concluded).push(thread);
  }
  return { open, concluded };
}

/** The four request ids that represent in-flight work for an entity — all keyed
 *  by entity id and shared with the edit pane, the card regen, and SEGA. */
export function entityRequestIds(entityId: string): string[] {
  return [
    entitySummaryRequestId(entityId),
    entitySummaryBindRequestId(entityId),
    lorebookContentRequestId(entityId),
    lorebookKeysRequestId(entityId),
  ];
}

// Lives in core/store/selectors/runtime so the regen effect can gate on the same
// predicate the cards dim from; re-exported here for the World's own callers.
export { isRequestActive };

/** True while any of the entity's requests is active, queued, or SEGA-active. */
export function entityPending(
  runtime: RootState["runtime"],
  entityId: string,
): boolean {
  return entityRequestIds(entityId).some((id) => isRequestActive(runtime, id));
}

export type BorderKind = "draft" | "pending" | "incomplete" | "complete";

/** Status border kind. Draft wins; then pending (an in-flight regen) wins over a
 *  stale complete; then complete (summary + lorebook text + keys) vs incomplete.
 *  `complete` defaults false so a 2-arg call yields the store-only behavior. */
export function entityBorderKind(
  entity: WorldEntity,
  pending: boolean,
  complete: boolean = false,
): BorderKind {
  if (entity.lifecycle === "draft") return "draft";
  if (pending) return "pending";
  return complete ? "complete" : "incomplete";
}
