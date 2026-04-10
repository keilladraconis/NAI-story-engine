/**
 * SeImportWizard — single-pane import wizard.
 *
 * Combines foundation field import (Memory → ATTG, A/N → Style) with
 * lorebook binding and foundation generation (Shape, Intent).
 *
 * Auto-triggered at startup when no SE entities exist but external content
 * is detected. Also accessible via the "Import" button in SeHeaderBar.
 */

import {
  SuiComponent,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { entityBound, entitiesBoundBatch } from "../../core/store/slices/world";
import { attgUpdated, styleUpdated, attgSyncSet, styleSyncSet, shapeGenerationRequested, intentGenerationRequested } from "../../core/store/slices/foundation";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";
import {
  detectCategory,
  cycleDulfsCategory,
} from "../../core/utils/category-detect";
import { IDS } from "../framework/ids";
import type { EditPaneHost } from "./SeContentWithTitlePane";

// ── Types ──────────────────────────────────────────────────────────────────────

type SeImportWizardTheme = { default: { self: { style: object } } };
type SeImportWizardState = Record<string, never>;
export type SeImportWizardOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeImportWizardTheme, SeImportWizardState>;

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
  sectionLabel: {
    "font-size": "11px",
    "font-weight": "bold",
    opacity: "0.5",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    "margin-top": "8px",
    "margin-bottom": "4px",
  },
  importRow: {
    gap: "6px",
    "align-items": "center",
    padding: "6px 0",
    "border-bottom": "1px solid rgba(255,255,255,0.04)",
  },
  importLabel: {
    "flex-shrink": "0",
    "font-size": "12px",
    "font-weight": "bold",
    opacity: "0.8",
    "min-width": "80px",
  },
  importPreview: {
    flex: "1",
    "font-size": "11px",
    opacity: "0.5",
    overflow: "hidden",
    "white-space": "nowrap",
    "text-overflow": "ellipsis",
  },
  importBtn: {
    "font-size": "11px",
    "flex-shrink": "0",
    padding: "2px 7px",
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}


// ── Component ──────────────────────────────────────────────────────────────────

export class SeImportWizard extends SuiComponent<
  SeImportWizardTheme,
  SeImportWizardState,
  SeImportWizardOptions,
  UIPartColumn
> {
  private _entries: LorebookEntry[] = [];
  private _categoryNames: Map<string, string> = new Map();
  private _dulfsMap: Map<string, DulfsFieldID> = new Map();


  constructor(options: SeImportWizardOptions) {
    super(
      { state: {} as SeImportWizardState, ...options },
      { default: { self: { style: {} } } },
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _managedEntryIds(): Set<string> {
    const { entitiesById } = store.getState().world;
    return new Set(
      Object.values(entitiesById)
        .map((e) => e.lorebookEntryId)
        .filter((id): id is string => !!id),
    );
  }

  private _unmanagedEntries(): LorebookEntry[] {
    const managed = this._managedEntryIds();
    return this._entries.filter((e) => !managed.has(e.id));
  }

  // ── Foundation section ───────────────────────────────────────────────────────

  private _buildFoundationSection(memText: string, anText: string): UIPart[] {
    const { row, text } = api.v1.ui.part;
    const parts: UIPart[] = [];

    if (memText.trim()) {
      parts.push(
        row({
          id: IDS.IMPORT.ATTG_ROW,
          style: S.importRow,
          content: [
            text({ text: "Memory → ATTG", style: S.importLabel }),
            text({ text: truncate(memText, 60), style: S.importPreview }),
            api.v1.ui.part.button({
              id: IDS.IMPORT.ATTG_BTN,
              text: "Import",
              style: S.importBtn,
              callback: () => {
                store.dispatch(attgUpdated({ attg: memText }));
                store.dispatch(attgSyncSet({ enabled: true }));
                void api.v1.memory.set(memText);
                api.v1.ui.updateParts([
                  { id: IDS.IMPORT.ATTG_ROW, style: { ...S.importRow, opacity: "0.4" } } as unknown as Partial<UIPart> & { id: string },
                  { id: IDS.IMPORT.ATTG_BTN, text: "Imported ✓" } as unknown as Partial<UIPart> & { id: string },
                ]);
              },
            }),
          ],
        }),
      );
    }

    if (anText.trim()) {
      parts.push(
        row({
          id: IDS.IMPORT.STYLE_ROW,
          style: S.importRow,
          content: [
            text({ text: "A/N → Style", style: S.importLabel }),
            text({ text: truncate(anText, 60), style: S.importPreview }),
            api.v1.ui.part.button({
              id: IDS.IMPORT.STYLE_BTN,
              text: "Import",
              style: S.importBtn,
              callback: () => {
                store.dispatch(styleUpdated({ style: anText }));
                store.dispatch(styleSyncSet({ enabled: true }));
                api.v1.ui.updateParts([
                  { id: IDS.IMPORT.STYLE_ROW, style: { ...S.importRow, opacity: "0.4" } } as unknown as Partial<UIPart> & { id: string },
                  { id: IDS.IMPORT.STYLE_BTN, text: "Imported ✓" } as unknown as Partial<UIPart> & { id: string },
                ]);
              },
            }),
          ],
        }),
      );
    }

    // Generate Shape + Intent from story context (always shown)
    parts.push(
      row({
        id: IDS.IMPORT.ANALYZE_ROW,
        style: S.importRow,
        content: [
          text({ text: "Story → Shape + Intent", style: S.importLabel }),
          text({ text: "", style: S.importPreview }),
          api.v1.ui.part.button({
            id: IDS.IMPORT.ANALYZE_BTN,
            text: "Shape",
            style: S.importBtn,
            callback: () => { store.dispatch(shapeGenerationRequested()); },
          }),
          api.v1.ui.part.button({
            text: "Intent",
            style: S.importBtn,
            callback: () => { store.dispatch(intentGenerationRequested()); },
          }),
        ],
      }),
    );

    return parts;
  }

  // ── Lorebook body ────────────────────────────────────────────────────────────

  private _buildLorebookBody(): UIPart[] {
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
        const ids = IDS.IMPORT.entry(entryId);

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
                  this._rebuildLorebookBody();
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
                  this._rebuildLorebookBody();
                },
              }),
            ],
          }),
        );
      }
    }

    return parts;
  }

  private _rebuildLorebookBody(): void {
    api.v1.ui.updateParts([
      {
        id: IDS.IMPORT.BODY,
        content: this._buildLorebookBody(),
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  // ── Compose ─────────────────────────────────────────────────────────────────

  async compose(): Promise<UIPartColumn> {
    const { column, row, text, button } = api.v1.ui.part;
    const { editHost } = this.options;

    const [entries, categories, memText, anText] = await Promise.all([
      api.v1.lorebook.entries(),
      api.v1.lorebook.categories(),
      api.v1.memory.get(),
      api.v1.an.get(),
    ]);

    // Build category map; identify SE-managed categories to exclude
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

    this._entries = entries.filter(
      (e) => !e.category || !seCategories.has(e.category),
    );

    for (const entry of this._entries) {
      if (!this._dulfsMap.has(entry.id)) {
        this._dulfsMap.set(entry.id, detectCategory(entry.text ?? ""));
      }
    }

    const foundationParts = this._buildFoundationSection(memText, anText);

    const headerRow = row({
      style: S.header,
      content: [
        button({
          iconId: "arrow-left" as IconId,
          callback: () => { editHost.close(); },
        }),
        text({ text: "**Import Existing Content**", markdown: true, style: S.title }),
        button({
          id: IDS.IMPORT.IMPORT_ALL_BTN,
          text: "Import All",
          style: S.bindAllBtn,
          callback: () => {
            // ATTG + Style
            if (memText.trim()) {
              store.dispatch(attgUpdated({ attg: memText }));
              store.dispatch(attgSyncSet({ enabled: true }));
              void api.v1.memory.set(memText);
            }
            if (anText.trim()) {
              store.dispatch(styleUpdated({ style: anText }));
              store.dispatch(styleSyncSet({ enabled: true }));
            }
            // Lorebook entities
            const unmanaged = this._unmanagedEntries();
            if (unmanaged.length > 0) {
              const entities = unmanaged.map((entry) => ({
                id: api.v1.uuid(),
                categoryId:
                  this._dulfsMap.get(entry.id) ??
                  detectCategory(entry.text ?? ""),
                lorebookEntryId: entry.id,
                name: entry.displayName || "Unknown",
                summary: "",
              }));
              store.dispatch(entitiesBoundBatch(entities));
            }
            // Shape + Intent from story context
            store.dispatch(shapeGenerationRequested());
            store.dispatch(intentGenerationRequested());
            editHost.close();
          },
        }),
      ],
    });

    return column({
      id: this.id,
      style: { gap: "4px", "justify-content": "flex-start", flex: "1" },
      content: [
        headerRow,
        text({ text: "Foundation Fields", style: S.sectionLabel }),
        ...foundationParts,
        text({ text: "Lorebook Entries", style: S.sectionLabel }),
        column({
          id: IDS.IMPORT.BODY,
          style: { gap: "2px" },
          content: this._buildLorebookBody(),
        }),
      ],
    });
  }
}
