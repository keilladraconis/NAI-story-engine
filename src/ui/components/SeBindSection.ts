/**
 * SeBindSection — full-pane "Bind Existing Lorebooks" panel.
 *
 * Opened via editHost (replaces the main story engine pane content).
 * Triggered by the chain-link icon button in the World section header.
 *
 * Lists all unmanaged lorebook entries grouped by their lorebook category.
 * Each entry card has a DULFS category cycle button and a single-click Bind button.
 * "Bind All" button sits at the top right of the panel header.
 *
 * Entries in SE-managed categories ("SE: *") are excluded.
 */

import {
  SuiComponent,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { entityBound } from "../../core/store/slices/world";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";
import {
  detectCategory,
  cycleDulfsCategory,
} from "../../core/utils/category-detect";
import { IDS } from "../framework/ids";
import type { EditPaneHost } from "./SeContentWithTitlePane";

// ── Types ──────────────────────────────────────────────────────────────────────

type SeBindSectionTheme = { default: { self: { style: object } } };
type SeBindSectionState = Record<string, never>;
export type SeBindSectionOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeBindSectionTheme, SeBindSectionState>;

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  header: {
    "align-items": "center",
    gap: "8px",
    "margin-bottom": "8px",
  },
  title: {
    flex: "1",
    "font-weight": "bold",
    "font-size": "14px",
  },
  bindAllBtn: {
    "font-size": "12px",
    "flex-shrink": "0",
    padding: "4px 10px",
  },
  groupHeader: {
    "font-size": "11px",
    "font-weight": "bold",
    opacity: "0.5",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    "margin-top": "10px",
    "margin-bottom": "2px",
  },
  entryRow: {
    gap: "6px",
    "align-items": "center",
    padding: "4px 0",
    "border-bottom": "1px solid rgba(255,255,255,0.04)",
  },
  entryName: {
    flex: "1",
    "font-size": "13px",
    overflow: "hidden",
    "white-space": "nowrap",
    "text-overflow": "ellipsis",
  },
  catBtn: {
    "font-size": "11px",
    "flex-shrink": "0",
    padding: "2px 5px",
    opacity: "0.7",
  },
  bindBtn: {
    "font-size": "11px",
    "flex-shrink": "0",
    padding: "2px 7px",
  },
  empty: {
    opacity: "0.5",
    "font-size": "13px",
    padding: "8px 0",
  },
} as const;

// ── DULFS short labels ─────────────────────────────────────────────────────────

const DULFS_SHORT: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Char",
  [FieldID.UniverseSystems]: "Sys",
  [FieldID.Locations]: "Loc",
  [FieldID.Factions]: "Fac",
  [FieldID.SituationalDynamics]: "Dyn",
  [FieldID.Topics]: "Topic",
};

// ── Component ──────────────────────────────────────────────────────────────────

export class SeBindSection extends SuiComponent<
  SeBindSectionTheme,
  SeBindSectionState,
  SeBindSectionOptions,
  UIPartColumn
> {
  private _entries: LorebookEntry[] = [];
  private _categoryNames: Map<string, string> = new Map();
  private _dulfsMap: Map<string, DulfsFieldID> = new Map();

  constructor(options: SeBindSectionOptions) {
    super(
      { state: {} as SeBindSectionState, ...options },
      { default: { self: { style: {} } } },
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _managedEntryIds(): Set<string> {
    return new Set(
      store
        .getState()
        .world.entities.map((e) => e.lorebookEntryId)
        .filter((id): id is string => !!id),
    );
  }

  private _unmanagedEntries(): LorebookEntry[] {
    const managed = this._managedEntryIds();
    return this._entries.filter((e) => !managed.has(e.id));
  }

  // ── Body ────────────────────────────────────────────────────────────────────

  private _buildBody(): UIPart[] {
    const { row, text } = api.v1.ui.part;
    const unmanaged = this._unmanagedEntries();

    if (unmanaged.length === 0) {
      return [
        text({
          text: "All lorebook entries are managed by Story Engine.",
          style: S.empty,
        }),
      ];
    }

    // Group by lorebook category
    const groups = new Map<string, LorebookEntry[]>();
    for (const entry of unmanaged) {
      const key = entry.category ?? "uncategorized";
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    // Named categories alphabetically, "Uncategorized" last
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === "uncategorized") return 1;
      if (b === "uncategorized") return -1;
      const nameA = this._categoryNames.get(a) ?? a;
      const nameB = this._categoryNames.get(b) ?? b;
      return nameA.localeCompare(nameB);
    });

    const parts: UIPart[] = [];

    for (const catKey of sortedKeys) {
      const entries = groups.get(catKey)!;
      const catLabel =
        catKey === "uncategorized"
          ? "Uncategorized"
          : (this._categoryNames.get(catKey) ?? catKey);

      parts.push(text({ text: catLabel, style: S.groupHeader }));

      for (const entry of entries) {
        const entryId = entry.id;
        const catId =
          this._dulfsMap.get(entryId) ?? detectCategory(entry.text ?? "");
        const ids = IDS.BIND.entry(entryId);

        parts.push(
          row({
            id: ids.ROW,
            style: S.entryRow,
            content: [
              text({ text: entry.displayName || "(unnamed)", style: S.entryName }),
              api.v1.ui.part.button({
                id: ids.CAT_BTN,
                text: `${DULFS_SHORT[catId]} ▶`,
                style: S.catBtn,
                callback: () => {
                  this._dulfsMap.set(entryId, cycleDulfsCategory(catId));
                  void this._rebuildBody();
                },
              }),
              api.v1.ui.part.button({
                id: ids.BIND_BTN,
                text: "⚡ Bind",
                style: S.bindBtn,
                callback: () => {
                  store.dispatch(
                    entityBound({
                      entity: {
                        id: api.v1.uuid(),
                        categoryId: catId,
                        lifecycle: "live",
                        lorebookEntryId: entryId,
                        name: entry.displayName || "Unknown",
                        summary: "",
                      },
                    }),
                  );
                  api.v1.ui.toast(
                    `Bound: ${entry.displayName || "entry"}`,
                    { type: "success" },
                  );
                  this._rebuildBody();
                },
              }),
            ],
          }),
        );
      }
    }

    return parts;
  }

  private _rebuildBody(): void {
    api.v1.ui.updateParts([
      {
        id: IDS.BIND.BODY,
        content: this._buildBody(),
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  // ── Compose ─────────────────────────────────────────────────────────────────

  async compose(): Promise<UIPartColumn> {
    const { column, row, text, button } = api.v1.ui.part;
    const { editHost } = this.options;

    // Fetch lorebook data
    const [entries, categories] = await Promise.all([
      api.v1.lorebook.entries(),
      api.v1.lorebook.categories(),
    ]);

    // Build category name map; mark SE-managed categories for exclusion
    const seCategories = new Set(
      categories
        .filter((c) => (c.name ?? "").startsWith("SE:"))
        .map((c) => c.id),
    );
    this._categoryNames = new Map(
      categories
        .filter((c) => !seCategories.has(c.id))
        .map((c) => [c.id, c.name ?? c.id]),
    );

    // Exclude entries in SE categories
    this._entries = entries.filter(
      (e) => !e.category || !seCategories.has(e.category),
    );

    // Seed DULFS map for entries not yet assigned
    for (const entry of this._entries) {
      if (!this._dulfsMap.has(entry.id)) {
        this._dulfsMap.set(entry.id, detectCategory(entry.text ?? ""));
      }
    }

    return column({
      id: this.id,
      style: { gap: "4px" },
      content: [
        // Header: back + title + bind all
        row({
          style: S.header,
          content: [
            button({
              iconId: "arrow-left" as IconId,
              callback: () => { editHost.close(); },
            }),
            text({ text: "**Bind Existing Lorebooks**", markdown: true, style: S.title }),
            button({
              id: IDS.BIND.BIND_ALL_BTN,
              text: "Bind All",
              style: S.bindAllBtn,
              callback: () => {
                const unmanaged = this._unmanagedEntries();
                if (unmanaged.length === 0) return;
                for (const entry of unmanaged) {
                  const catId =
                    this._dulfsMap.get(entry.id) ??
                    detectCategory(entry.text ?? "");
                  store.dispatch(
                    entityBound({
                      entity: {
                        id: api.v1.uuid(),
                        categoryId: catId,
                        lifecycle: "live",
                        lorebookEntryId: entry.id,
                        name: entry.displayName || "Unknown",
                        summary: "",
                      },
                    }),
                  );
                }
                api.v1.ui.toast(
                  `Bound ${unmanaged.length} ${unmanaged.length === 1 ? "entry" : "entries"}`,
                  { type: "success" },
                );
                this._rebuildBody();
              },
            }),
          ],
        }),
        // Body: grouped entry list
        column({
          id: IDS.BIND.BODY,
          style: { gap: "2px" },
          content: this._buildBody(),
        }),
      ],
    });
  }
}
