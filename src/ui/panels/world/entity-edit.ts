// Pure Save helpers for the entity edit pane. Framework-free, unit-tested.
// Mirrors the keys/erato/name-propagation logic in SUI SeEntityEditPane._save.

import type { WorldEntity } from "../../../core/store";

/** Split a comma string into trimmed, non-empty keys. */
export function parseKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** Prepend the erato "----\n" divider to non-empty content when erato mode is on
 *  and it isn't already prefixed. */
export function applyEratoPrefix(content: string, erato: boolean): string {
  if (content && erato && !content.startsWith("----\n"))
    return "----\n" + content;
  return content;
}

/** Replace `oldName` with `newName` (case-insensitive) in every OTHER entity's
 *  summary, returning only the entities whose summary actually changed. */
export function propagateNameInSummaries(
  entities: WorldEntity[],
  entityId: string,
  oldName: string,
  newName: string,
): Array<{ entityId: string; summary: string }> {
  if (!oldName || oldName === newName) return [];
  const pattern = new RegExp(
    oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi",
  );
  const updates: Array<{ entityId: string; summary: string }> = [];
  for (const other of entities) {
    if (other.id === entityId) continue;
    const updated = other.summary.replace(pattern, newName);
    if (updated !== other.summary) {
      updates.push({ entityId: other.id, summary: updated });
    }
  }
  return updates;
}
