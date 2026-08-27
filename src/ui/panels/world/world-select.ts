// Pure, framework-free selectors for the World display. Mirrors SUI
// SeWorldSection._selectBody and SeEntityCard's status logic, but store-only
// (no async lorebook reads this slice). Unit-tested headless — no icon imports.

import { isForgeDraft } from "../../../core/store/selectors/forge";
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
 *  the right thread — and a thread's cast is a detector input (the subjects its
 *  `advancedConditions` probe for, see `thread-condition.ts`), not a place
 *  entities live. Casting Ada in "the succession" should not remove Ada from the
 *  World. So `loose` is now simply the entities the World lists; the name is
 *  kept because every caller reads it positionally and the meaning it carries —
 *  "what the World shows" — is the one it always should have had.
 *
 *  Forge drafts stay hidden: they render as inline cards inside their forge
 *  chat, and showing them here would list them twice. */
export function selectWorldBody(
  entitiesById: Record<string, WorldEntity>,
  threads: Thread[],
): { threads: Thread[]; loose: WorldEntity[] } {
  const loose = Object.values(entitiesById).filter((e) => !isForgeDraft(e));
  return { threads, loose };
}

/** Threads split into the working set and the fold.
 *
 *  Open threads are what the story still owes; satisfied and abandoned are what
 *  it has settled or walked away from. They accumulate — a long story resolves
 *  many — and twenty finished rows bury the three that matter.
 *
 *  Both retired readings share one fold. `abandoned` is a distinct READING, and
 *  deliberately so (a check against a commitment nobody resolved would tell the
 *  writer something untrue), but it behaves exactly as satisfied does elsewhere:
 *  the entry goes quiet, the slot frees, reopening is one press.
 *
 *  Order within each list is the stored order. The World lists threads as they
 *  were created and partitioning must not re-sort them under a reaching finger. */
export function partitionThreads(threads: Thread[]): {
  open: Thread[];
  retired: Thread[];
} {
  const open: Thread[] = [];
  const retired: Thread[] = [];
  for (const thread of threads) {
    (thread.status === "open" ? open : retired).push(thread);
  }
  return { open, retired };
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
