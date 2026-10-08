// The lorebook entry an entity is bound to: making one, renaming it. Shared by
// the Scenario Build handler and its undo, so both follow the same rules.

import type { DulfsFieldID } from "../../../config/field-definitions";
import { ensureCategory } from "./lorebook-sync";
import { nameKey } from "./handlers/lorebook";

/** Bind a lorebook entry for a new entity. An unmanaged entry (no category)
 *  with the same display name is adopted; otherwise an empty one is created,
 *  keyed on the name so it activates as soon as the name is written. */
export async function bindEntryFor(entity: {
  name: string;
  categoryId: DulfsFieldID;
}): Promise<{ entryId: string; created: boolean }> {
  const category = await ensureCategory(entity.categoryId);
  const all = await api.v1.lorebook.entries();
  const existing = all.find(
    (e) =>
      (e.displayName ?? "").toLowerCase() === entity.name.toLowerCase() &&
      !e.category,
  );
  if (existing) {
    await api.v1.lorebook.updateEntry(existing.id, { category });
    return { entryId: existing.id, created: false };
  }
  const entryId = await api.v1.lorebook.createEntry({
    id: api.v1.uuid(),
    displayName: entity.name,
    text: "",
    keys: [nameKey(entity.name)],
    enabled: true,
    category,
  });
  return { entryId, created: true };
}

/** Rename an entity's entry. The key is swapped only while it is still the
 *  stub made from the old name; keys anyone has set since are left alone. */
export async function renameEntry(
  entryId: string,
  from: string,
  to: string,
): Promise<void> {
  const entry = await api.v1.lorebook.entry(entryId);
  if (!entry) return;
  const stub = entry.keys?.length === 1 && entry.keys[0] === nameKey(from);
  await api.v1.lorebook.updateEntry(entryId, {
    displayName: to,
    ...(stub ? { keys: [nameKey(to)] } : {}),
  });
}
