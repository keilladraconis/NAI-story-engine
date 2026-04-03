/**
 * SeEntityEditPane — Unified entity editing panel.
 *
 * Draft entities: name + summary editing only.
 * Live entities:  name + summary + lorebook content + keys (icon gen buttons).
 *
 * Opened via labelCallback on the entity card (title click).
 * Replaces the combination of SeContentWithTitlePane + SeLorebookContentPane for entities.
 *
 * Lorebook content/keys auto-save on change via api.v1.lorebook.updateEntry().
 * Name/summary are committed on Save.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
} from "../../core/store/slices/ui";
import {
  entityEdited,
  entitySummaryUpdated,
  entityUnbound,
} from "../../core/store/slices/world";
import { IDS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../../ui/framework/ids";
import { SeGenerationIconButton } from "./SeGenerationButton";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeEntityEditPaneOptions = {
  entityId:  string;
  lifecycle: "draft" | "live";
  editHost:  EditPaneHost;
} & SuiComponentOptions<Theme, State>;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  container:    { gap: "6px", flex: "1" },
  header:       { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
  headerName:   { flex: "1", "font-size": "0.95em", "font-weight": "bold" },
  sectionLabel: { "font-size": "0.8em", "font-weight": "bold", opacity: "0.7", flex: "1" },
  sectionRow:   { "align-items": "center", gap: "4px" },
  nameInput:    { "font-size": "0.85em" },
  summaryInput: { "min-height": "80px", "font-size": "0.85em", flex: "1" },
  saveBtn:      { "align-self": "flex-end", padding: "4px 16px" },
  lbDivider:    { "margin-top": "8px", "border-top": "1px solid rgba(255,255,255,0.08)", "padding-top": "8px" },
  contentInput: { "font-size": "13px", flex: "auto" },
  keysRow:      { "align-items": "center", gap: "4px", "margin-top": "4px" },
  keysInput:    { "font-size": "12px", flex: "1" },
  unbindBtn:    { "margin-top": "12px", "align-self": "flex-start", "font-size": "0.85em", padding: "4px 8px", opacity: "0.6" },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export class SeEntityEditPane extends SuiComponent<
  Theme, State, SeEntityEditPaneOptions, UIPartColumn
> {
  private readonly _contentBtn: SeGenerationIconButton | null;
  private readonly _keysBtn:    SeGenerationIconButton | null;

  constructor(options: SeEntityEditPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );

    if (options.lifecycle === "live") {
      const entity  = store.getState().world.entities.find(e => e.id === options.entityId);
      const entryId = entity?.lorebookEntryId ?? "";

      this._contentBtn = new SeGenerationIconButton({
        id:         IDS.LOREBOOK.GEN_CONTENT_BTN,
        iconId:     "zap" as IconId,
        requestId:  entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
        onGenerate: () => {
          if (!entryId) return;
          store.dispatch(uiLorebookContentGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
          }));
        },
        contentChecker: async () => {
          if (!entryId) return false;
          const entry = await api.v1.lorebook.entry(entryId);
          return !!(entry?.text);
        },
      });

      this._keysBtn = new SeGenerationIconButton({
        id:         IDS.LOREBOOK.GEN_KEYS_BTN,
        iconId:     "key" as IconId,
        requestId:  entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
        onGenerate: () => {
          if (!entryId) return;
          store.dispatch(uiLorebookKeysGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
          }));
        },
        contentChecker: async () => {
          if (!entryId) return false;
          const entry = await api.v1.lorebook.entry(entryId);
          return !!(entry?.keys && entry.keys.length > 0);
        },
      });
    } else {
      this._contentBtn = null;
      this._keysBtn    = null;
    }
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId, lifecycle, editHost } = this.options;
    const L  = IDS.LOREBOOK;
    const EP = IDS.EDIT_PANE;

    const state   = store.getState();
    const entity  = state.world.entities.find(e => e.id === entityId);
    const entryId = entity?.lorebookEntryId ?? "";

    // Wire streaming updates so generation handlers can push to this pane
    if (lifecycle === "live" && entryId) {
      store.dispatch(uiLorebookEntrySelected({ entryId, categoryId: null }));
    }

    // Seed name/summary storage so storageKey-bound inputs pick up current values
    await api.v1.storyStorage.set(EDIT_PANE_TITLE,   entity?.name    ?? "");
    await api.v1.storyStorage.set(EDIT_PANE_CONTENT, entity?.summary ?? "");

    // Seed lorebook drafts from current entry
    if (lifecycle === "live" && entryId) {
      const entry = await api.v1.lorebook.entry(entryId);
      await api.v1.storyStorage.set(L.CONTENT_DRAFT_RAW, entry?.text ?? "");
      await api.v1.storyStorage.set(L.KEYS_DRAFT_RAW,    entry?.keys?.join(", ") ?? "");
    }

    const _close = (): void => {
      if (lifecycle === "live") {
        store.dispatch(uiLorebookEntrySelected({ entryId: null, categoryId: null }));
      }
      editHost.close();
    };

    const _save = (): void => {
      void (async () => {
        const newName    = String((await api.v1.storyStorage.get(EDIT_PANE_TITLE))   ?? "").trim();
        const newSummary = String((await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) ?? "").trim();
        const trimmedName = newName || (entity?.name ?? "");
        const oldName     = entity?.name ?? "";

        store.dispatch(entityEdited({ entityId, name: trimmedName, summary: newSummary }));

        // Propagate name change to other entities' summaries
        if (oldName && oldName !== trimmedName) {
          const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          for (const other of store.getState().world.entities) {
            if (other.id === entityId) continue;
            const updated = other.summary.replace(pattern, trimmedName);
            if (updated !== other.summary) {
              store.dispatch(entitySummaryUpdated({ entityId: other.id, summary: updated }));
            }
          }
        }

        _close();
      })();
    };

    const { column, row, text, button, textInput, multilineTextInput } = api.v1.ui.part;

    const parts: UIPart[] = [

      // ── Header ─────────────────────────────────────────────────────────────
      row({
        style:   S.header,
        content: [
          button({
            id:       `${this.id}-back`,
            iconId:   "arrow-left" as IconId,
            callback: () => { _close(); },
          }),
          text({
            text:     `**${entity?.name ?? "Entity"}**`,
            markdown: true,
            style:    S.headerName,
          }),
        ],
      }),

      // ── Name ───────────────────────────────────────────────────────────────
      text({ text: "Name", style: S.sectionLabel }),
      textInput({
        id:           EP.TITLE_INPUT,
        initialValue: entity?.name ?? "",
        placeholder:  "Entity name…",
        storageKey:   `story:${EDIT_PANE_TITLE}`,
        style:        S.nameInput,
      }),

      // ── Summary ────────────────────────────────────────────────────────────
      text({ text: "Summary", style: S.sectionLabel }),
      multilineTextInput({
        id:           EP.CONTENT_INPUT,
        initialValue: entity?.summary ?? "",
        placeholder:  "Brief description of this entity…",
        storageKey:   `story:${EDIT_PANE_CONTENT}`,
        style:        S.summaryInput,
      }),

      // ── Save ───────────────────────────────────────────────────────────────
      button({
        id:       EP.SAVE_BTN,
        text:     "Save",
        style:    S.saveBtn,
        callback: () => { _save(); },
      }),
    ];

    // ── Lorebook section (live only) ──────────────────────────────────────────
    if (lifecycle === "live" && this._contentBtn && this._keysBtn) {
      const [contentGenPart, keysGenPart] = await Promise.all([
        this._contentBtn.build(),
        this._keysBtn.build(),
      ]);

      parts.push(

        // Divider
        text({ text: "", style: S.lbDivider }),

        // Content header row: label + gen icon button
        row({
          style:   S.sectionRow,
          content: [
            text({ text: "Content", style: S.sectionLabel }),
            contentGenPart,
          ],
        }),

        // Content textarea — auto-saves to lorebook on change
        multilineTextInput({
          id:           L.CONTENT_INPUT,
          initialValue: "",
          placeholder:  "Lorebook content…",
          storageKey:   `story:${L.CONTENT_DRAFT_KEY}`,
          style:        S.contentInput,
          onChange:     async (value: string) => {
            if (!entryId) return;
            const erato = (await api.v1.config.get("erato_compatibility")) || false;
            const withHeader = erato && !value.startsWith("----\n") ? "----\n" + value : value;
            await api.v1.lorebook.updateEntry(entryId, { text: withHeader });
          },
        }),

        // Keys row: label + input + gen icon button
        row({
          style:   S.keysRow,
          content: [
            text({ text: "Keys", style: S.sectionLabel }),
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
            keysGenPart,
          ],
        }),
      );

      // Unbind (destructive — at the bottom)
      if (entryId) {
        parts.push(
          button({
            id:       L.UNBIND_BTN,
            text:     "✕ Unbind from Story Engine",
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
        );
      }
    }

    return column({
      id:      this.id,
      style:   S.container,
      content: parts,
    });
  }
}
