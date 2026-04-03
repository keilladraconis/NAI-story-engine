/**
 * SeLorebookContentPane — Panel-modal lorebook editor for a managed entity.
 *
 * Opened via editHost.open() when a live entity card's label is clicked.
 * Provides full lorebook editing: content, keys, refine, relationships, and
 * entity actions (reforge / unbind).
 *
 * Dispatches uiLorebookEntrySelected on open/close to wire streaming updates.
 * Seeds CONTENT_DRAFT_RAW and KEYS_DRAFT_RAW from current lorebook entry.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookRefineRequested,
} from "../../core/store/slices/ui";
import {
  entityReforgeRequested,
  entityUnbound,
  relationshipAdded,
  relationshipRemoved,
} from "../../core/store/slices/world";
import type { Relationship } from "../../core/store/types";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationButton } from "./SeGenerationButton";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeLorebookContentPaneOptions = {
  entityId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  entryName:      { "font-weight": "bold", "font-size": "0.95em", flex: "1" },
  lifecycleBadge: { "font-size": "11px", opacity: "0.5", "font-style": "italic", "flex-shrink": "0" },
  buttonRow:      { gap: "8px", "margin-top": "4px" },
  contentInput:   { "font-size": "13px", flex: "auto" },
  keysRow:        { gap: "8px", "align-items": "center" },
  keysLabel:      { "font-size": "12px", color: "rgba(255,255,255,0.6)", "white-space": "nowrap" },
  keysInput:      { "font-size": "12px", flex: "1" },
  refineRow:      { gap: "8px", "align-items": "center", "margin-top": "8px" },
  refineInput:    { "font-size": "12px", flex: "1" },
  relsHeader:     { gap: "8px", "align-items": "center", "margin-top": "12px" },
  relsLabel:      { "font-size": "12px", color: "rgba(255,255,255,0.5)", flex: "1" },
  addRelBtn:      { padding: "2px 8px", "font-size": "12px" },
  relsList:       { gap: "2px", "margin-top": "4px" },
  relFormHidden:  { display: "none", gap: "6px", "align-items": "center", "margin-top": "4px" },
  relFormVisible: { display: "flex", gap: "6px", "align-items": "center", "margin-top": "4px" },
  relFormTarget:  { "font-size": "12px", "flex-shrink": "0", padding: "2px 6px" },
  relFormDesc:    { "font-size": "12px", flex: "1" },
  relFormAction:  { "font-size": "12px", padding: "2px 8px", "flex-shrink": "0" },
  actionRow:      { gap: "8px", "margin-top": "12px" },
  actionBtn:      { flex: "1", "font-size": "0.85em", padding: "4px 8px" },
  unbindBtn:      { flex: "1", "font-size": "0.85em", padding: "4px 8px", opacity: "0.6" },
  relRow:         { gap: "6px", "align-items": "center", padding: "2px 0", "font-size": "0.85em" },
  relText:        { flex: "1", opacity: "0.9" },
  relDeleteBtn:   { padding: "1px 6px", opacity: "0.6", "font-size": "0.85em", "flex-shrink": "0" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export class SeLorebookContentPane extends SuiComponent<
  Theme, State, SeLorebookContentPaneOptions, UIPartColumn
> {
  private readonly _watcher:    StoreWatcher;
  private readonly _contentBtn: SeGenerationButton;
  private readonly _keysBtn:    SeGenerationButton;
  private readonly _refineBtn:  SeGenerationButton;

  private _relFormVisible     = false;
  private _availableEntities: Array<{ id: string; name: string }> = [];
  private _targetIdx          = 0;

  constructor(options: SeLorebookContentPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    const { entityId } = options;
    const entity  = store.getState().world.entities.find(e => e.id === entityId);
    const entryId = entity?.lorebookEntryId ?? "";

    this._contentBtn = new SeGenerationButton({
      id:        IDS.LOREBOOK.GEN_CONTENT_BTN,
      label:     "⚡ Regen Content",
      requestId: entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
      onGenerate: () => {
        if (!entryId) return;
        store.dispatch(uiLorebookContentGenerationRequested({
          requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
        }));
      },
    });

    this._keysBtn = new SeGenerationButton({
      id:        IDS.LOREBOOK.GEN_KEYS_BTN,
      label:     "⚡ Regen Keys",
      requestId: entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
      onGenerate: () => {
        if (!entryId) return;
        store.dispatch(uiLorebookKeysGenerationRequested({
          requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
        }));
      },
    });

    this._refineBtn = new SeGenerationButton({
      id:        IDS.LOREBOOK.REFINE_BTN,
      label:     "Refine",
      requestId: entryId ? IDS.LOREBOOK.entry(entryId).REFINE_REQ : undefined,
      onGenerate: () => {
        if (!entryId) return;
        store.dispatch(uiLorebookRefineRequested({
          requestId: IDS.LOREBOOK.entry(entryId).REFINE_REQ,
        }));
      },
    });
  }

  private _buildRelRow(rel: Relationship): UIPart {
    const { row, text, button } = api.v1.ui.part;
    const R = IDS.LOREBOOK.relationship(rel.id);
    const entities = store.getState().world.entities;
    const fromName = entities.find(e => e.id === rel.fromEntityId)?.name ?? "?";
    const toName   = entities.find(e => e.id === rel.toEntityId)?.name   ?? "?";
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
    const { entityId } = this.options;
    const state  = store.getState();
    const entity = state.world.entities.find(e => e.id === entityId);
    const rels   = entity
      ? state.world.relationships.filter(
          r => r.fromEntityId === entity.id || r.toEntityId === entity.id,
        )
      : [];
    api.v1.ui.updateParts([
      {
        id:      IDS.LOREBOOK.RELATIONSHIPS_LIST,
        content: rels.map(r => this._buildRelRow(r)),
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId, editHost } = this.options;
    const L = IDS.LOREBOOK;

    this._watcher.dispose();
    this._relFormVisible = false;

    const state   = store.getState();
    const entity  = state.world.entities.find(e => e.id === entityId);
    const entryId = entity?.lorebookEntryId ?? "";

    // Wire streaming updates to this pane
    if (entryId) {
      store.dispatch(uiLorebookEntrySelected({ entryId, categoryId: null }));
    }

    // Seed drafts from current lorebook entry
    if (entryId) {
      const entry = await api.v1.lorebook.entry(entryId);
      await api.v1.storyStorage.set(L.CONTENT_DRAFT_RAW, entry?.text || "");
      await api.v1.storyStorage.set(L.KEYS_DRAFT_RAW, entry?.keys?.join(", ") || "");
    }

    // Reactive relationship list
    this._watcher.watch(
      (s) => {
        const e = s.world.entities.find(x => x.id === entityId);
        return e
          ? s.world.relationships
              .filter(r => r.fromEntityId === e.id || r.toEntityId === e.id)
              .map(r => r.id)
          : [] as string[];
      },
      () => { this._rebuildRelationships(); },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const [contentPart, keysPart, refinePart] = await Promise.all([
      this._contentBtn.build(),
      this._keysBtn.build(),
      this._refineBtn.build(),
    ]);

    const { column, row, text, button, multilineTextInput, textInput } = api.v1.ui.part;

    // Initial relationships
    const rels = entity
      ? state.world.relationships.filter(
          r => r.fromEntityId === entity.id || r.toEntityId === entity.id,
        )
      : [];

    const _close = (): void => {
      store.dispatch(uiLorebookEntrySelected({ entryId: null, categoryId: null }));
      editHost.close();
    };

    return column({
      id:    this.id,
      style: { gap: "6px", flex: "1" },
      content: [

        // ── Header ─────────────────────────────────────────────────────
        row({
          style: { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
          content: [
            button({
              id:       `${this.id}-back`,
              text:     "",
              iconId:   "arrow-left" as IconId,
              callback: () => { _close(); },
            }),
            text({
              id:       L.ENTRY_NAME,
              text:     `**${entity?.name ?? ""}**`,
              markdown: true,
              style:    S.entryName,
            }),
            text({
              id:    L.LIFECYCLE_BADGE,
              text:  entity ? `[${entity.lifecycle}]` : "",
              style: S.lifecycleBadge,
            }),
          ],
        }),

        // ── Gen buttons ────────────────────────────────────────────────
        row({ style: S.buttonRow, content: [contentPart, keysPart] }),

        // ── Content textarea ───────────────────────────────────────────
        multilineTextInput({
          id:           L.CONTENT_INPUT,
          initialValue: "",
          placeholder:  "Lorebook content...",
          storageKey:   `story:${L.CONTENT_DRAFT_KEY}`,
          style:        S.contentInput,
          onChange:     async (value: string) => {
            if (!entryId) return;
            const erato = (await api.v1.config.get("erato_compatibility")) || false;
            const withHeader = erato && !value.startsWith("----\n") ? "----\n" + value : value;
            await api.v1.lorebook.updateEntry(entryId, { text: withHeader });
          },
        }),

        // ── Keys ───────────────────────────────────────────────────────
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
                if (!entryId) return;
                const keys = value.split(",").map(k => k.trim()).filter(k => k.length > 0);
                await api.v1.lorebook.updateEntry(entryId, { keys });
              },
            }),
          ],
        }),

        // ── Refine ─────────────────────────────────────────────────────
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

        // ── Relationships ──────────────────────────────────────────────
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
                  const s = store.getState();
                  this._availableEntities = s.world.entities
                    .filter(e => e.lifecycle === "live" && e.id !== entityId)
                    .map(e => ({ id: e.id, name: e.name }));
                  this._targetIdx = 0;
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

        column({
          id:      L.RELATIONSHIPS_LIST,
          style:   S.relsList,
          content: rels.map(r => this._buildRelRow(r)),
        }),

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
                if (!entityId || this._availableEntities.length === 0) return;
                const target = this._availableEntities[this._targetIdx];
                if (!target) return;
                const desc = String(
                  (await api.v1.storyStorage.get(STORAGE_KEYS.REL_FORM_DESC)) || "",
                ).trim();
                store.dispatch(relationshipAdded({
                  relationship: {
                    id:           api.v1.uuid(),
                    fromEntityId: entityId,
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

        // ── Entity actions ─────────────────────────────────────────────
        row({
          style: S.actionRow,
          content: [
            button({
              id:       L.REFORGE_ENTITY_BTN,
              text:     "⟲ Reforge Entity",
              style:    S.actionBtn,
              callback: () => {
                store.dispatch(entityReforgeRequested({ entityId }));
                _close();
              },
            }),
            button({
              id:       L.UNBIND_BTN,
              text:     "✕ Unbind",
              style:    S.unbindBtn,
              callback: () => {
                const e = store.getState().world.entities.find(x => x.id === entityId);
                if (e) {
                  store.dispatch(entityUnbound({ entityId }));
                  api.v1.ui.toast(`Unbound: ${e.name}`, { type: "success" });
                }
                _close();
              },
            }),
          ],
        }),

      ],
    });
  }
}
