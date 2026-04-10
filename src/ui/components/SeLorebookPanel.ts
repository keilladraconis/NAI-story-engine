/**
 * SeLorebookPanel — Lorebook script panel (simplified).
 *
 * Two views:
 *   Empty:     no entry selected, or a managed entry is selected
 *              (managed entries are edited via SeLorebookContentPane from entity cards)
 *   Unmanaged: entry selected but not managed by Story Engine — shows bind view
 *
 * Generation, content editing, relationships, and entity actions for managed
 * entries have moved to SeLorebookContentPane.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { entityBound } from "../../core/store/slices/world";
import {
  detectCategory,
  cycleDulfsCategory,
  DULFS_CATEGORY_LABELS,
} from "../../core/utils/category-detect";
import type { DulfsFieldID } from "../../config/field-definitions";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";

type SeLorebookPanelTheme = { default: { self: { style: object } } };
type SeLorebookPanelState = Record<string, never>;

export type SeLorebookPanelOptions = SuiComponentOptions<
  SeLorebookPanelTheme,
  SeLorebookPanelState
>;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  container: { height: "100%" },
  stateContainer: {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: "20px",
    color: "rgba(255,255,255,0.5)",
    "flex-direction": "column",
    gap: "8px",
  },
  stateHidden: {
    display: "none",
    "align-items": "center",
    "justify-content": "center",
    padding: "20px",
    color: "rgba(255,255,255,0.5)",
  },
  bindRow: { gap: "8px", "margin-top": "8px" },
  bindBtn: { flex: "1" },
  categoryBtn: { "font-size": "12px", "flex-shrink": "0", padding: "3px 8px" },
};

export class SeLorebookPanel extends SuiComponent<
  SeLorebookPanelTheme,
  SeLorebookPanelState,
  SeLorebookPanelOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private _currentEntryId: string | null = null;
  private _currentCategoryId: DulfsFieldID = "topics" as DulfsFieldID;

  constructor(options: SeLorebookPanelOptions) {
    super(
      { state: {} as SeLorebookPanelState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartColumn> {
    this._watcher.dispose();

    const L = IDS.LOREBOOK;

    // Switch between empty and unmanaged based on selected entry
    this._watcher.watch(
      (s) => {
        const entryId = s.ui.lorebook.selectedEntryId;
        const isManaged = entryId
          ? Object.values(s.world.entitiesById).some((e) => e.lorebookEntryId === entryId)
          : false;
        return { entryId, isManaged };
      },
      async ({ entryId, isManaged }) => {
        this._currentEntryId = entryId;
        this._currentCategoryId = "topics" as DulfsFieldID;

        if (!entryId || isManaged) {
          // Show empty state (no entry, or managed entry — edit via entity card)
          api.v1.ui.updateParts([
            { id: L.EMPTY_STATE, style: S.stateContainer },
            { id: L.NOT_MANAGED, style: S.stateHidden },
          ]);
          return;
        }

        // Unmanaged entry — show bind view
        const entry = await api.v1.lorebook.entry(entryId);
        if (!entry) {
          api.v1.ui.updateParts([
            { id: L.EMPTY_STATE, style: S.stateContainer },
            { id: L.NOT_MANAGED, style: S.stateHidden },
          ]);
          return;
        }

        const detected = detectCategory(entry.text || "");
        this._currentCategoryId = detected;
        api.v1.ui.updateParts([
          { id: L.EMPTY_STATE, style: S.stateHidden },
          { id: L.NOT_MANAGED, style: S.stateContainer },
          {
            id: L.CATEGORY_BTN,
            text: `Category: ${DULFS_CATEGORY_LABELS[detected]} ▶`,
          },
        ]);
      },
      (a, b) => a.entryId === b.entryId && a.isManaged === b.isManaged,
    );

    const { column, text, button, row } = api.v1.ui.part;

    return column({
      id: L.CONTAINER,
      style: S.container,
      content: [
        // ── Empty state ─────────────────────────────────────────────────────
        column({
          id: L.EMPTY_STATE,
          style: S.stateContainer,
          content: [
            text({ text: "Select a Lorebook entry to manage it." }),
            text({
              text: "Managed entries can be edited via their entity cards.",
              style: {
                "font-size": "0.8em",
                opacity: "0.6",
                "text-align": "center",
              },
            }),
          ],
        }),

        // ── Unmanaged / bind view ───────────────────────────────────────────
        column({
          id: L.NOT_MANAGED,
          style: S.stateHidden,
          content: [
            text({
              text: "This entry is not managed by Story Engine.",
              style: { "margin-bottom": "8px", "text-align": "center" },
            }),
            row({
              style: S.bindRow,
              content: [
                button({
                  id: L.BIND_BTN,
                  text: "⚡ Bind to Story Engine",
                  style: S.bindBtn,
                  callback: async () => {
                    const entryId = this._currentEntryId;
                    if (!entryId) return;

                    const entry = await api.v1.lorebook.entry(entryId);
                    const name = entry?.displayName || "Unknown";
                    store.dispatch(
                      entityBound({
                        entity: {
                          id: api.v1.uuid(),
                          categoryId: this._currentCategoryId,
                          lorebookEntryId: entryId,
                          name,
                          summary: "",
                        },
                      }),
                    );
                    api.v1.ui.toast(`Bound: ${name}`, { type: "success" });
                  },
                }),
                button({
                  id: L.CATEGORY_BTN,
                  text: `Category: ${DULFS_CATEGORY_LABELS[this._currentCategoryId]} ▶`,
                  style: S.categoryBtn,
                  callback: () => {
                    this._currentCategoryId = cycleDulfsCategory(
                      this._currentCategoryId,
                    );
                    api.v1.ui.updateParts([
                      {
                        id: L.CATEGORY_BTN,
                        text: `Category: ${DULFS_CATEGORY_LABELS[this._currentCategoryId]} ▶`,
                      },
                    ]);
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }
}
