// Pure, framework-free selectors for the World display. Mirrors SUI
// SeWorldSection._selectBody and SeEntityCard's status logic, but store-only
// (no async lorebook reads this slice). Unit-tested headless — no icon imports.

import { isForgeDraft } from "../../../core/store/selectors/forge";
import {
  entitySummaryRequestId,
  entitySummaryBindRequestId,
  lorebookContentRequestId,
  lorebookKeysRequestId,
} from "../../../core/keys";
import type { RootState, WorldEntity, WorldGroup } from "../../../core/store";

/** Visible World body: every thread (including empty ones, so they stay
 *  editable/deletable from their card), plus loose (ungrouped, non-forge-draft)
 *  entities. A thread's own member list still hides forge drafts (ThreadItem). */
export function selectWorldBody(
  entitiesById: Record<string, WorldEntity>,
  groups: WorldGroup[],
): { groups: WorldGroup[]; loose: WorldEntity[] } {
  const grouped = new Set(groups.flatMap((g) => g.entityIds));
  const loose = Object.values(entitiesById).filter(
    (e) => !grouped.has(e.id) && !isForgeDraft(e),
  );
  return { groups, loose };
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

/** True while a specific request id is active, queued, or SEGA-active. */
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
