/**
 * Bind / Rebind Modal — Phase 5
 *
 * Two sections in one modal:
 *   Bind New:  Show unmanaged lorebook entries with checkbox + category selector.
 *              "Bind Selected" adopts them into the world state (Imported batch).
 *   Rebind:    Show managed entities whose lorebook entries are missing or drifted.
 *              Options: Recreate (missing) / Accept (drifted) / Unbind.
 */

import { BindContext } from "nai-act";
import { RootState, WorldEntity, AppDispatch } from "../../../core/store/types";
import { DulfsFieldID } from "../../../config/field-definitions";
import {
  entityBound,
  entityUnbound,
  entityCast,
  batchCreated,
} from "../../../core/store/slices/world";
import { ensureCategory } from "../../../core/store/effects/lorebook-sync";
import {
  detectCategory,
  cycleDulfsCategory,
  DULFS_CATEGORY_LABELS,
} from "../../../core/utils/category-detect";
import { STORAGE_KEYS } from "../../framework/ids";

const { row, text, button, checkboxInput } = api.v1.ui.part;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HEADER = {
  "font-weight": "bold",
  "font-size": "14px",
  "margin-bottom": "6px",
  "border-bottom": "1px solid rgba(255,255,255,0.1)",
  "padding-bottom": "4px",
};

const SUB_HEADER = {
  "font-size": "12px",
  opacity: "0.6",
  "margin-top": "8px",
  "margin-bottom": "4px",
  "font-style": "italic",
};

const ENTRY_ROW = {
  gap: "8px",
  "align-items": "center",
  padding: "4px 0",
  "border-bottom": "1px solid rgba(255,255,255,0.04)",
};

const CATEGORY_BTN = { "font-size": "12px", "flex-shrink": "0", padding: "2px 6px" };
const ACTION_BTN = { "font-size": "12px", "flex-shrink": "0", padding: "2px 8px" };
const UNBIND_BTN = { ...ACTION_BTN, opacity: "0.6" };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hasSEHeader(text: string): boolean {
  return text.startsWith("Name:") || text.startsWith("----\nName:");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal context interface for use outside of component build(). */
export interface BindModalCtx {
  getState: () => RootState;
  dispatch: AppDispatch;
}

export async function openBindModal(ctx: BindContext<RootState> | BindModalCtx): Promise<void> {
  // Persistent closure state across rebuilds
  let allEntries: LorebookEntry[] = [];
  const selected = new Set<string>();             // entry IDs checked for binding
  const categories = new Map<string, DulfsFieldID>(); // entry ID → chosen category

  const modal = await api.v1.ui.modal.open({
    title: "Bind / Rebind",
    size: "large",
    content: [text({ text: "Loading..." })],
  });

  async function rebuild(): Promise<void> {
    if (modal.isClosed()) return;

    allEntries = await api.v1.lorebook.entries();
    const state = ctx.getState();

    const managedEntryIds = new Set(
      state.world.entities
        .map((e) => e.lorebookEntryId)
        .filter((id): id is string => !!id),
    );

    // ── Bind New: unmanaged entries ────────────────────────────────────────

    const unmanagedEntries = allEntries.filter((e) => !managedEntryIds.has(e.id));
    for (const entry of unmanagedEntries) {
      if (!categories.has(entry.id)) {
        categories.set(entry.id, detectCategory(entry.text || ""));
      }
    }

    // ── Rebind: managed entities with issues ───────────────────────────────

    const liveEntities = state.world.entities.filter(
      (e) => e.lifecycle === "live" && e.lorebookEntryId,
    );
    const missingEntities: WorldEntity[] = [];
    const driftedPairs: Array<{ entity: WorldEntity; entry: LorebookEntry }> = [];

    for (const entity of liveEntities) {
      const entry = allEntries.find((e) => e.id === entity.lorebookEntryId);
      if (!entry) {
        missingEntities.push(entity);
      } else if (entry.text && !hasSEHeader(entry.text)) {
        driftedPairs.push({ entity, entry });
      }
    }

    // ── Build content ──────────────────────────────────────────────────────

    const content: UIPart[] = [];

    // === Bind New section ===
    content.push(text({ text: "Bind New", style: SECTION_HEADER }));

    if (unmanagedEntries.length === 0) {
      content.push(
        text({
          text: "All lorebook entries are managed by Story Engine.",
          style: { opacity: "0.5", "font-size": "13px", padding: "4px 0" },
        }),
      );
    } else {
      for (const entry of unmanagedEntries) {
        const catId = categories.get(entry.id)!;
        const entryId = entry.id;

        content.push(
          row({
            style: ENTRY_ROW,
            content: [
              checkboxInput({
                initialValue: selected.has(entryId),
                label: entry.displayName || "(unnamed)",
                onChange: (checked: boolean) => {
                  if (checked) selected.add(entryId);
                  else selected.delete(entryId);
                },
              }),
              button({
                text: `${DULFS_CATEGORY_LABELS[catId]} ▶`,
                style: CATEGORY_BTN,
                callback: () => {
                  categories.set(entryId, cycleDulfsCategory(catId));
                  void rebuild();
                },
              }),
            ],
          }),
        );
      }

      content.push(
        button({
          text: `Bind Selected (${selected.size})`,
          style: { "margin-top": "10px" },
          callback: async () => {
            if (selected.size === 0) return;

            const currentState = ctx.getState();
            let importedBatch = currentState.world.batches.find((b) => b.name === "Imported");
            let batchId: string;
            if (!importedBatch) {
              batchId = api.v1.uuid();
              ctx.dispatch(
                batchCreated({ batch: { id: batchId, name: "Imported", entityIds: [] } }),
              );
            } else {
              batchId = importedBatch.id;
            }

            let count = 0;
            for (const entryId of selected) {
              const entry = allEntries.find((e) => e.id === entryId);
              if (!entry) continue;
              const catId = categories.get(entryId) ?? detectCategory(entry.text || "");
              ctx.dispatch(
                entityBound({
                  entity: {
                    id: api.v1.uuid(),
                    batchId,
                    categoryId: catId,
                    lifecycle: "live",
                    lorebookEntryId: entryId,
                    name: entry.displayName || "Unknown",
                    summary: "",
                  },
                }),
              );
              count++;
            }

            selected.clear();
            api.v1.ui.toast(
              count > 0 ? `Bound ${count} entr${count === 1 ? "y" : "ies"}` : "Nothing selected",
              { type: count > 0 ? "success" : "warning" },
            );
            await rebuild();
          },
        }),
      );
    }

    // === Rebind section ===
    if (missingEntities.length > 0 || driftedPairs.length > 0) {
      content.push(
        text({ text: "Rebind", style: { ...SECTION_HEADER, "margin-top": "20px" } }),
      );

      // Missing entries
      if (missingEntities.length > 0) {
        content.push(
          text({ text: "Missing (lorebook entry deleted):", style: SUB_HEADER }),
        );
        for (const entity of missingEntities) {
          content.push(
            row({
              style: ENTRY_ROW,
              content: [
                text({ text: entity.name, style: { flex: "1" } }),
                button({
                  text: "Recreate",
                  style: ACTION_BTN,
                  callback: async () => {
                    const categoryId = await ensureCategory(entity.categoryId);
                    const newEntryId = await api.v1.lorebook.createEntry({
                      id: api.v1.uuid(),
                      displayName: entity.name,
                      text: "",
                      keys: [],
                      category: categoryId,
                      enabled: true,
                    });
                    ctx.dispatch(
                      entityCast({ entityId: entity.id, lorebookEntryId: newEntryId }),
                    );
                    api.v1.ui.toast(`Recreated: ${entity.name}`, { type: "success" });
                    await rebuild();
                  },
                }),
                button({
                  text: "Unbind",
                  style: UNBIND_BTN,
                  callback: () => {
                    ctx.dispatch(entityUnbound({ entityId: entity.id }));
                    void rebuild();
                  },
                }),
              ],
            }),
          );
        }
      }

      // Drifted entries
      if (driftedPairs.length > 0) {
        content.push(
          text({ text: "Drifted (manually edited without SE header):", style: SUB_HEADER }),
        );
        for (const { entity, entry } of driftedPairs) {
          content.push(
            row({
              style: ENTRY_ROW,
              content: [
                text({ text: entity.name, style: { flex: "1" } }),
                button({
                  text: "Accept",
                  style: ACTION_BTN,
                  callback: async () => {
                    // Prepend SE header to preserve user edits while restoring format
                    const existing = entry.text || "";
                    const setting = String(
                      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
                    );
                    const typeLabel = DULFS_CATEGORY_LABELS[entity.categoryId] || "Entry";
                    const header = `Name: ${entity.name}\nType: ${typeLabel}\nSetting: ${setting}\n`;
                    await api.v1.lorebook.updateEntry(entry.id, { text: header + existing });
                    api.v1.ui.toast(`Accepted: ${entity.name}`, { type: "success" });
                    await rebuild();
                  },
                }),
                button({
                  text: "Unbind",
                  style: UNBIND_BTN,
                  callback: () => {
                    ctx.dispatch(entityUnbound({ entityId: entity.id }));
                    void rebuild();
                  },
                }),
              ],
            }),
          );
        }
      }
    }

    if (!modal.isClosed()) {
      await modal.update({ content });
    }
  }

  await rebuild();

  modal.closed.then(() => {
    selected.clear();
    categories.clear();
  });
}
