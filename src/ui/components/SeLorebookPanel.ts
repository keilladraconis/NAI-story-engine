/**
 * SeLorebookPanel — SUI replacement for LorebookPanelContent (nai-act).
 *
 * Three views (show/hide via updateParts, not structural rebuilds):
 *   Empty:     no entry selected
 *   Unmanaged: entry selected but not managed by Story Engine
 *   Managed:   full content/keys editor + relationships
 *
 * Generation buttons use SeGenerationButton.
 * Relationship list rebuilds reactively via StoreWatcher.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookRefineRequested,
} from "../../core/store/slices/ui";
import {
  entityReforgeRequested,
  entityUnbound,
  entityBound,
  batchCreated,
  relationshipAdded,
  relationshipRemoved,
} from "../../core/store/slices/world";
import {
  detectCategory,
  cycleDulfsCategory,
  DULFS_CATEGORY_LABELS,
} from "../../core/utils/category-detect";
import type { DulfsFieldID } from "../../config/field-definitions";
import type { Relationship } from "../../core/store/types";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationButton } from "./SeGenerationButton";

type SeLorebookPanelTheme = { default: { self: { style: object } } };
type SeLorebookPanelState = Record<string, never>;

export type SeLorebookPanelOptions =
  SuiComponentOptions<SeLorebookPanelTheme, SeLorebookPanelState>;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  container:       { height: "100%" },
  stateContainer:  { display: "flex", "align-items": "center", "justify-content": "center", padding: "20px", color: "rgba(255,255,255,0.5)" },
  stateHidden:     { display: "none", "align-items": "center", "justify-content": "center", padding: "20px", color: "rgba(255,255,255,0.5)" },
  mainContent:     { height: "100%" },
  mainHidden:      { display: "none" },
  entryName:       { "font-weight": "bold", "font-size": "16px", flex: "1" },
  lifecycleBadge:  { "font-size": "11px", opacity: "0.5", "font-style": "italic", "flex-shrink": "0" },
  buttonRow:       { gap: "8px", "margin-top": "4px" },
  contentInput:    { "font-size": "13px", flex: "auto" },
  keysRow:         { gap: "8px", "align-items": "center" },
  keysLabel:       { "font-size": "12px", color: "rgba(255,255,255,0.6)", "white-space": "nowrap" },
  keysInput:       { "font-size": "12px", flex: "1" },
  refineRow:       { gap: "8px", "align-items": "center", "margin-top": "8px" },
  refineInput:     { "font-size": "12px", flex: "1" },
  relsHeader:      { gap: "8px", "align-items": "center", "margin-top": "12px" },
  relsLabel:       { "font-size": "12px", color: "rgba(255,255,255,0.5)", flex: "1" },
  addRelBtn:       { padding: "2px 8px", "font-size": "12px" },
  relsList:        { gap: "2px", "margin-top": "4px" },
  relFormHidden:   { display: "none", gap: "6px", "align-items": "center", "margin-top": "4px" },
  relFormVisible:  { display: "flex", gap: "6px", "align-items": "center", "margin-top": "4px" },
  relFormTarget:   { "font-size": "12px", "flex-shrink": "0", padding: "2px 6px" },
  relFormDesc:     { "font-size": "12px", flex: "1" },
  relFormAction:   { "font-size": "12px", padding: "2px 8px", "flex-shrink": "0" },
  actionRow:       { gap: "8px", "margin-top": "12px" },
  actionBtn:       { flex: "1", "font-size": "0.85em", padding: "4px 8px" },
  unbindBtn:       { flex: "1", "font-size": "0.85em", padding: "4px 8px", opacity: "0.6" },
  bindRow:         { gap: "8px", "margin-top": "8px" },
  bindBtn:         { flex: "1" },
  categoryBtn:     { "font-size": "12px", "flex-shrink": "0", padding: "3px 8px" },
  relRow:          { gap: "6px", "align-items": "center", padding: "2px 0", "font-size": "0.85em" },
  relText:         { flex: "1", opacity: "0.9" },
  relDeleteBtn:    { padding: "1px 6px", opacity: "0.6", "font-size": "0.85em", "flex-shrink": "0" },
};

export class SeLorebookPanel extends SuiComponent<
  SeLorebookPanelTheme,
  SeLorebookPanelState,
  SeLorebookPanelOptions,
  UIPartColumn
> {
  private readonly _watcher:    StoreWatcher;
  private readonly _contentBtn: SeGenerationButton;
  private readonly _keysBtn:    SeGenerationButton;
  private readonly _refineBtn:  SeGenerationButton;

  // Mutable refs — closures read these at callback time, not at compose time
  private _currentEntryId:    string | null = null;
  private _currentEntityId:   string | null = null;
  private _currentCategoryId: DulfsFieldID = "topics" as DulfsFieldID;
  private _relFormVisible     = false;
  private _availableEntities: Array<{ id: string; name: string }> = [];
  private _targetIdx          = 0;

  constructor(options: SeLorebookPanelOptions) {
    super(
      { state: {} as SeLorebookPanelState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    this._contentBtn = new SeGenerationButton({
      id:    IDS.LOREBOOK.GEN_CONTENT_BTN,
      label: "⚡ Regen Content",
      stateProjection:         (s) => s.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (p) => {
        const entryId = p as string | null;
        return entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined;
      },
      isDisabledFromProjection: (p) => !(p as string | null),
      onGenerate: () => {
        const entryId = store.getState().ui.lorebook.selectedEntryId;
        if (entryId) {
          store.dispatch(uiLorebookContentGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
          }));
        }
      },
    });

    this._keysBtn = new SeGenerationButton({
      id:    IDS.LOREBOOK.GEN_KEYS_BTN,
      label: "⚡ Regen Keys",
      stateProjection:         (s) => s.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (p) => {
        const entryId = p as string | null;
        return entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined;
      },
      isDisabledFromProjection: (p) => !(p as string | null),
      onGenerate: () => {
        const entryId = store.getState().ui.lorebook.selectedEntryId;
        if (entryId) {
          store.dispatch(uiLorebookKeysGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
          }));
        }
      },
    });

    this._refineBtn = new SeGenerationButton({
      id:    IDS.LOREBOOK.REFINE_BTN,
      label: "Refine",
      stateProjection:         (s) => s.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (p) => {
        const entryId = p as string | null;
        return entryId ? IDS.LOREBOOK.entry(entryId).REFINE_REQ : undefined;
      },
      isDisabledFromProjection: (p) => !(p as string | null),
      onGenerate: () => {
        const entryId = store.getState().ui.lorebook.selectedEntryId;
        if (entryId) {
          store.dispatch(uiLorebookRefineRequested({
            requestId: IDS.LOREBOOK.entry(entryId).REFINE_REQ,
          }));
        }
      },
    });
  }

  private _buildRelRow(rel: Relationship): UIPart {
    const { row, text, button } = api.v1.ui.part;
    const R         = IDS.LOREBOOK.relationship(rel.id);
    const entities  = store.getState().world.entities;
    const fromName  = entities.find((e) => e.id === rel.fromEntityId)?.name ?? "?";
    const toName    = entities.find((e) => e.id === rel.toEntityId)?.name   ?? "?";
    return row({
      id:    R.ROOT,
      style: S.relRow,
      content: [
        text({ text: `${fromName} → ${toName}: ${rel.description}`, style: S.relText }),
        button({
          id:       R.DELETE_BTN,
          text:     "✕",
          style:    S.relDeleteBtn,
          callback: () => { store.dispatch(relationshipRemoved({ relationshipId: rel.id })); },
        }),
      ],
    });
  }

  private _rebuildRelationships(): void {
    const state   = store.getState();
    const entryId = state.ui.lorebook.selectedEntryId;
    const entity  = entryId
      ? state.world.entities.find((e) => e.lorebookEntryId === entryId)
      : undefined;

    const rels  = entity
      ? state.world.relationships.filter(
          (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
        )
      : [];

    api.v1.ui.updateParts([
      { id: IDS.LOREBOOK.RELATIONSHIPS_LIST, content: rels.map((r) => this._buildRelRow(r)) } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    this._watcher.dispose();

    const L = IDS.LOREBOOK;

    // ── Watcher 1: panel switching ──────────────────────────────────────────
    this._watcher.watch(
      (s) => {
        const entryId   = s.ui.lorebook.selectedEntryId;
        const isManaged = entryId
          ? s.world.entities.some((e) => e.lorebookEntryId === entryId)
          : false;
        return { entryId, isManaged };
      },
      async ({ entryId, isManaged }) => {
        api.v1.ui.updateParts([
          { id: L.EMPTY_STATE,  style: S.stateHidden },
          { id: L.NOT_MANAGED,  style: S.stateHidden },
          { id: L.MAIN_CONTENT, style: S.mainHidden  },
        ]);

        this._currentEntryId  = entryId;
        this._currentEntityId = null;
        this._relFormVisible  = false;
        api.v1.ui.updateParts([{ id: L.REL_FORM, style: S.relFormHidden }]);
        await api.v1.storyStorage.set(STORAGE_KEYS.REL_FORM_DESC, "");

        if (!entryId) {
          api.v1.ui.updateParts([{ id: L.EMPTY_STATE, style: S.stateContainer }]);
          return;
        }

        const entry = await api.v1.lorebook.entry(entryId);
        if (!entry) {
          api.v1.ui.updateParts([{ id: L.EMPTY_STATE, style: S.stateContainer }]);
          return;
        }

        if (!isManaged) {
          const detected      = detectCategory(entry.text || "");
          this._currentCategoryId = detected;
          api.v1.ui.updateParts([
            { id: L.NOT_MANAGED,  style: S.stateContainer },
            { id: L.CATEGORY_BTN, text: `Category: ${DULFS_CATEGORY_LABELS[detected]} ▶` },
          ]);
          return;
        }

        const entity = store.getState().world.entities.find((e) => e.lorebookEntryId === entryId);
        this._currentEntityId = entity?.id ?? null;

        await api.v1.storyStorage.set(L.CONTENT_DRAFT_RAW, entry.text || "");
        await api.v1.storyStorage.set(L.KEYS_DRAFT_RAW, entry.keys?.join(", ") || "");

        api.v1.ui.updateParts([
          { id: L.MAIN_CONTENT,    style: S.mainContent },
          { id: L.ENTRY_NAME,      text: entry.displayName || "Unnamed Entry" },
          { id: L.LIFECYCLE_BADGE, text: entity ? `[${entity.lifecycle}]` : "" },
        ]);
      },
      (a, b) => a.entryId === b.entryId && a.isManaged === b.isManaged,
    );

    // ── Watcher 2: lifecycle badge ──────────────────────────────────────────
    this._watcher.watch(
      (s) => {
        const entryId = s.ui.lorebook.selectedEntryId;
        return entryId
          ? (s.world.entities.find((e) => e.lorebookEntryId === entryId)?.lifecycle ?? "")
          : "";
      },
      (lifecycle) => {
        api.v1.ui.updateParts([
          { id: L.LIFECYCLE_BADGE, text: lifecycle ? `[${lifecycle}]` : "" },
        ]);
      },
    );

    // ── Watcher 3: relationship list ────────────────────────────────────────
    this._watcher.watch(
      (s) => {
        const entryId = s.ui.lorebook.selectedEntryId;
        const entity  = s.world.entities.find((e) => e.lorebookEntryId === entryId);
        return entity
          ? s.world.relationships
              .filter((r) => r.fromEntityId === entity.id || r.toEntityId === entity.id)
              .map((r) => r.id)
          : [] as string[];
      },
      () => { this._rebuildRelationships(); },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    // ── Build gen buttons (async) ───────────────────────────────────────────
    const [contentPart, keysPart, refinePart] = await Promise.all([
      this._contentBtn.build(),
      this._keysBtn.build(),
      this._refineBtn.build(),
    ]);

    const { column, row, text, button, multilineTextInput, textInput } = api.v1.ui.part;

    return column({
      id:    L.CONTAINER,
      style: S.container,
      content: [

        // ── Empty state ───────────────────────────────────────────────────
        column({
          id:      L.EMPTY_STATE,
          style:   S.stateContainer,
          content: [text({ text: "Select a Lorebook entry to generate content." })],
        }),

        // ── Unmanaged / bind view ─────────────────────────────────────────
        column({
          id:    L.NOT_MANAGED,
          style: S.stateHidden,
          content: [
            text({
              text:  "This entry is not managed by Story Engine.",
              style: { "margin-bottom": "8px", "text-align": "center" },
            }),
            row({
              style: S.bindRow,
              content: [
                button({
                  id:       L.BIND_BTN,
                  text:     "⚡ Bind to Story Engine",
                  style:    S.bindBtn,
                  callback: async () => {
                    const entryId = this._currentEntryId;
                    if (!entryId) return;

                    const state = store.getState();
                    let importedBatch = state.world.batches.find((b) => b.name === "Imported");
                    let batchId: string;
                    if (!importedBatch) {
                      batchId = api.v1.uuid();
                      store.dispatch(batchCreated({ batch: { id: batchId, name: "Imported", entityIds: [] } }));
                    } else {
                      batchId = importedBatch.id;
                    }

                    const entry = await api.v1.lorebook.entry(entryId);
                    const name  = entry?.displayName || "Unknown";
                    store.dispatch(entityBound({
                      entity: {
                        id:             api.v1.uuid(),
                        batchId,
                        categoryId:     this._currentCategoryId,
                        lifecycle:      "live",
                        lorebookEntryId: entryId,
                        name,
                        summary:        "",
                      },
                    }));
                    api.v1.ui.toast(`Bound: ${name}`, { type: "success" });
                  },
                }),
                button({
                  id:       L.CATEGORY_BTN,
                  text:     `Category: ${DULFS_CATEGORY_LABELS[this._currentCategoryId]} ▶`,
                  style:    S.categoryBtn,
                  callback: () => {
                    this._currentCategoryId = cycleDulfsCategory(this._currentCategoryId);
                    api.v1.ui.updateParts([{
                      id:   L.CATEGORY_BTN,
                      text: `Category: ${DULFS_CATEGORY_LABELS[this._currentCategoryId]} ▶`,
                    }]);
                  },
                }),
              ],
            }),
          ],
        }),

        // ── Managed main content ──────────────────────────────────────────
        column({
          id:    L.MAIN_CONTENT,
          style: S.mainHidden,
          content: [

            row({
              style:   { "align-items": "center", gap: "8px", "margin-bottom": "2px" },
              content: [
                text({ id: L.ENTRY_NAME,     text: "", style: S.entryName }),
                text({ id: L.LIFECYCLE_BADGE, text: "", style: S.lifecycleBadge }),
              ],
            }),

            row({ style: S.buttonRow, content: [contentPart, keysPart] }),

            multilineTextInput({
              id:           L.CONTENT_INPUT,
              initialValue: "",
              placeholder:  "Lorebook content...",
              storageKey:   `story:${L.CONTENT_DRAFT_KEY}`,
              style:        S.contentInput,
              onChange:     async (value: string) => {
                if (!this._currentEntryId) return;
                const erato = (await api.v1.config.get("erato_compatibility")) || false;
                const withHeader = erato && !value.startsWith("----\n") ? "----\n" + value : value;
                await api.v1.lorebook.updateEntry(this._currentEntryId, { text: withHeader });
              },
            }),

            row({
              style: S.keysRow,
              content: [
                text({ text: "Keys:", style: S.keysLabel }),
                textInput({
                  id:           L.KEYS_INPUT,
                  initialValue: "",
                  placeholder:  "comma, separated, keys",
                  storageKey:   `story:${L.KEYS_DRAFT_KEY}`,
                  style:        S.keysInput,
                  onChange:     async (value: string) => {
                    if (!this._currentEntryId) return;
                    const keys = value.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
                    await api.v1.lorebook.updateEntry(this._currentEntryId, { keys });
                  },
                }),
              ],
            }),

            row({
              style: S.refineRow,
              content: [
                textInput({
                  id:           L.REFINE_INSTRUCTIONS_INPUT,
                  initialValue: "",
                  placeholder:  "Describe changes...",
                  storageKey:   `story:${L.REFINE_INSTRUCTIONS_KEY}`,
                  style:        S.refineInput,
                }),
                refinePart,
              ],
            }),

            row({
              style: S.relsHeader,
              content: [
                text({ text: "Relationships", style: S.relsLabel }),
                button({
                  id:       L.ADD_REL_BTN,
                  text:     "+ Add",
                  style:    S.addRelBtn,
                  callback: () => {
                    if (this._relFormVisible) {
                      this._relFormVisible = false;
                      api.v1.ui.updateParts([{ id: L.REL_FORM, style: S.relFormHidden }]);
                      void api.v1.storyStorage.set(STORAGE_KEYS.REL_FORM_DESC, "");
                    } else {
                      const state = store.getState();
                      this._availableEntities = state.world.entities
                        .filter((e) => e.lifecycle === "live" && e.id !== this._currentEntityId)
                        .map((e) => ({ id: e.id, name: e.name }));
                      this._targetIdx      = 0;
                      this._relFormVisible = true;
                      api.v1.ui.updateParts([
                        { id: L.REL_FORM,            style: S.relFormVisible },
                        { id: L.REL_FORM_TARGET_BTN, text: this._availableEntities[0]?.name ?? "(no entities)" },
                      ]);
                    }
                  },
                }),
              ],
            }),

            column({ id: L.RELATIONSHIPS_LIST, style: S.relsList, content: [] }),

            row({
              id:    L.REL_FORM,
              style: S.relFormHidden,
              content: [
                button({
                  id:       L.REL_FORM_TARGET_BTN,
                  text:     "(no entities)",
                  style:    S.relFormTarget,
                  callback: () => {
                    if (this._availableEntities.length === 0) return;
                    this._targetIdx = (this._targetIdx + 1) % this._availableEntities.length;
                    api.v1.ui.updateParts([{
                      id:   L.REL_FORM_TARGET_BTN,
                      text: this._availableEntities[this._targetIdx].name,
                    }]);
                  },
                }),
                textInput({
                  id:           L.REL_FORM_DESC,
                  initialValue: "",
                  placeholder:  "Describe relationship...",
                  storageKey:   `story:${STORAGE_KEYS.REL_FORM_DESC_UI}`,
                  style:        S.relFormDesc,
                }),
                button({
                  id:       L.REL_FORM_ADD_BTN,
                  text:     "Add",
                  style:    S.relFormAction,
                  callback: async () => {
                    if (!this._currentEntityId || this._availableEntities.length === 0) return;
                    const target = this._availableEntities[this._targetIdx];
                    if (!target) return;
                    const desc = String(
                      (await api.v1.storyStorage.get(STORAGE_KEYS.REL_FORM_DESC)) || "",
                    ).trim();
                    store.dispatch(relationshipAdded({
                      relationship: {
                        id:           api.v1.uuid(),
                        fromEntityId: this._currentEntityId,
                        toEntityId:   target.id,
                        description:  desc || "related to",
                      },
                    }));
                    this._relFormVisible = false;
                    api.v1.ui.updateParts([{ id: L.REL_FORM, style: S.relFormHidden }]);
                    await api.v1.storyStorage.set(STORAGE_KEYS.REL_FORM_DESC, "");
                  },
                }),
                button({
                  id:       L.REL_FORM_CANCEL_BTN,
                  text:     "✕",
                  style:    S.relFormAction,
                  callback: () => {
                    this._relFormVisible = false;
                    api.v1.ui.updateParts([{ id: L.REL_FORM, style: S.relFormHidden }]);
                    void api.v1.storyStorage.set(STORAGE_KEYS.REL_FORM_DESC, "");
                  },
                }),
              ],
            }),

            row({
              style: S.actionRow,
              content: [
                button({
                  id:       L.REFORGE_ENTITY_BTN,
                  text:     "⟲ Reforge Entity",
                  style:    S.actionBtn,
                  callback: () => {
                    const state   = store.getState();
                    const entryId = state.ui.lorebook.selectedEntryId;
                    if (!entryId) return;
                    const entity = state.world.entities.find((e) => e.lorebookEntryId === entryId);
                    if (entity) store.dispatch(entityReforgeRequested({ entityId: entity.id }));
                  },
                }),
                button({
                  id:       L.UNBIND_BTN,
                  text:     "✕ Unbind",
                  style:    S.unbindBtn,
                  callback: () => {
                    const state   = store.getState();
                    const entryId = state.ui.lorebook.selectedEntryId;
                    if (!entryId) return;
                    const entity = state.world.entities.find((e) => e.lorebookEntryId === entryId);
                    if (entity) {
                      store.dispatch(entityUnbound({ entityId: entity.id }));
                      api.v1.ui.toast(`Unbound: ${entity.name}`, { type: "success" });
                    }
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
