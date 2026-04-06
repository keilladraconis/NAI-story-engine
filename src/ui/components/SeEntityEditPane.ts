/**
 * SeEntityEditPane — Unified entity editing panel.
 *
 * Draft entities: name + summary editing only.
 * Live entities:  name + summary + lorebook content + keys (icon gen buttons).
 *
 * Opened via labelCallback on the entity card (title click).
 * Replaces the combination of SeContentWithTitlePane + SeLorebookContentPane for entities.
 *
 * All fields (name, summary, lorebook content, keys) are committed on Save.
 * Lorebook content/keys are held in storyStorage draft slots until Save; not written on keystroke.
 */

import {
  SuiActionBar,
  SuiButton,
  SuiComponent,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
} from "../../core/store/slices/ui";
import {
  entityEdited,
  entityCategoryChanged,
  entitySummaryUpdated,
  entityUnbound,
} from "../../core/store/slices/world";
import {
  IDS,
  EDIT_PANE_TITLE,
  EDIT_PANE_CONTENT,
} from "../../ui/framework/ids";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";
import { SeGenerationIconButton } from "./SeGenerationButton";
import type { EditPaneHost } from "./SeContentWithTitlePane";

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = [
  { id: FieldID.DramatisPersonae, label: "Characters", icon: "user" },
  { id: FieldID.UniverseSystems, label: "Systems", icon: "cpu" },
  { id: FieldID.Locations, label: "Locations", icon: "map-pin" },
  { id: FieldID.Factions, label: "Factions", icon: "shield" },
  { id: FieldID.SituationalDynamics, label: "Vectors", icon: "activity" },
  { id: FieldID.Topics, label: "Topics", icon: "hash" },
] as const;

// Full style objects so updateParts doesn't drop the base padding/font-size set by SuiActionBar.
const CAT_BTN_BASE = {
  fontWeight: "normal",
  fontSize: "0.775rem",
  padding: "4px 8px",
  margin: "0",
  gap: "4px",
  border: "none",
};
const CAT_STYLE_DEFAULT = {
  ...CAT_BTN_BASE,
  opacity: "0.4",
  background: "none",
};
const CAT_STYLE_SELECTED = {
  ...CAT_BTN_BASE,
  opacity: "1",
  background: "rgba(144, 238, 144, 0.15)",
  borderRadius: "3px",
};

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeEntityEditPaneOptions = {
  entityId: string;
  lifecycle: "draft" | "live";
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  container: { gap: "6px", flex: "1", "justify-content": "flex-start" },
  header: { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
  headerName: { flex: "1", "font-size": "0.95em", "font-weight": "bold" },
  colLabel: { "font-size": "0.8em", "font-weight": "bold", opacity: "0.7" },
  rowLabel: {
    "font-size": "0.8em",
    "font-weight": "bold",
    opacity: "0.7",
    flex: "1",
  },
  sectionRow: { "align-items": "center", gap: "4px" },
  nameInput: { "font-size": "0.85em", "flex-shrink": "0" },
  summaryInput: { height: "80px", "font-size": "0.85em", flex: "none" },
  saveBtn: { padding: "4px 12px", "flex-shrink": "0" },
  lbDivider: {
    "margin-top": "8px",
    "border-top": "1px solid rgba(255,255,255,0.08)",
    "padding-top": "8px",
  },
  contentInput: { "font-size": "13px", flex: "auto" },
  keysRow: { "align-items": "center", gap: "4px", "margin-top": "4px" },
  keysInput: { "font-size": "12px", flex: "1" },
  unbindBtn: {
    "margin-top": "12px",
    "align-self": "flex-start",
    "font-size": "0.85em",
    padding: "4px 8px",
    opacity: "0.6",
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export class SeEntityEditPane extends SuiComponent<
  Theme,
  State,
  SeEntityEditPaneOptions,
  UIPartColumn
> {
  private readonly _contentBtn: SeGenerationIconButton | null;
  private readonly _keysBtn: SeGenerationIconButton | null;

  constructor(options: SeEntityEditPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );

    if (options.lifecycle === "live") {
      const entity = store
        .getState()
        .world.entities.find((e) => e.id === options.entityId);
      const entryId = entity?.lorebookEntryId ?? "";

      this._contentBtn = new SeGenerationIconButton({
        id: IDS.LOREBOOK.GEN_CONTENT_BTN,
        iconId: "zap" as IconId,
        requestId: entryId
          ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ
          : undefined,
        onGenerate: () => {
          if (!entryId) return;
          store.dispatch(
            uiLorebookContentGenerationRequested({
              requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
            }),
          );
        },
        contentChecker: async () => {
          if (!entryId) return false;
          const entry = await api.v1.lorebook.entry(entryId);
          return !!entry?.text;
        },
      });

      this._keysBtn = new SeGenerationIconButton({
        id: IDS.LOREBOOK.GEN_KEYS_BTN,
        iconId: "key" as IconId,
        requestId: entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
        onGenerate: () => {
          if (!entryId) return;
          store.dispatch(
            uiLorebookKeysGenerationRequested({
              requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
            }),
          );
        },
        contentChecker: async () => {
          if (!entryId) return false;
          const entry = await api.v1.lorebook.entry(entryId);
          return !!(entry?.keys && entry.keys.length > 0);
        },
      });
    } else {
      this._contentBtn = null;
      this._keysBtn = null;
    }
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId, lifecycle, editHost } = this.options;
    const L = IDS.LOREBOOK;
    const EP = IDS.EDIT_PANE;

    const state = store.getState();
    const entity = state.world.entities.find((e) => e.id === entityId);
    const entryId = entity?.lorebookEntryId ?? "";

    // Wire streaming updates so generation handlers can push to this pane
    if (lifecycle === "live" && entryId) {
      store.dispatch(uiLorebookEntrySelected({ entryId, categoryId: null }));
    }

    // Seed name/summary storage so storageKey-bound inputs pick up current values
    await api.v1.storyStorage.set(EDIT_PANE_TITLE, entity?.name ?? "");
    await api.v1.storyStorage.set(EDIT_PANE_CONTENT, entity?.summary ?? "");

    // Seed lorebook drafts from current entry
    if (lifecycle === "live" && entryId) {
      const entry = await api.v1.lorebook.entry(entryId);
      await api.v1.storyStorage.set(L.CONTENT_DRAFT_RAW, entry?.text ?? "");
      await api.v1.storyStorage.set(
        L.KEYS_DRAFT_RAW,
        entry?.keys?.join(", ") ?? "",
      );
    }

    const _close = (): void => {
      if (lifecycle === "live") {
        store.dispatch(
          uiLorebookEntrySelected({ entryId: null, categoryId: null }),
        );
      }
      editHost.close();
    };

    const _save = (): void => {
      void (async () => {
        const newName = String(
          (await api.v1.storyStorage.get(EDIT_PANE_TITLE)) ?? "",
        ).trim();
        const newSummary = String(
          (await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) ?? "",
        ).trim();
        const trimmedName = newName || (entity?.name ?? "");
        const oldName = entity?.name ?? "";

        store.dispatch(
          entityEdited({ entityId, name: trimmedName, summary: newSummary }),
        );

        // Propagate name change to other entities' summaries
        if (oldName && oldName !== trimmedName) {
          const pattern = new RegExp(
            oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi",
          );
          for (const other of store.getState().world.entities) {
            if (other.id === entityId) continue;
            const updated = other.summary.replace(pattern, trimmedName);
            if (updated !== other.summary) {
              store.dispatch(
                entitySummaryUpdated({ entityId: other.id, summary: updated }),
              );
            }
          }
        }

        // Flush lorebook content and keys on save (not on each keystroke)
        if (lifecycle === "live" && entryId) {
          const rawContent = String(
            (await api.v1.storyStorage.get(L.CONTENT_DRAFT_RAW)) ?? "",
          );
          const erato =
            (await api.v1.config.get("erato_compatibility")) || false;
          const content =
            erato && !rawContent.startsWith("----\n")
              ? "----\n" + rawContent
              : rawContent;
          const rawKeys = String(
            (await api.v1.storyStorage.get(L.KEYS_DRAFT_RAW)) ?? "",
          );
          const keys = rawKeys
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
          await api.v1.lorebook.updateEntry(entryId, { text: content, keys });
        }

        _close();
      })();
    };

    const { column, row, text, button, textInput, multilineTextInput } =
      api.v1.ui.part;

    // ── Category bar ─────────────────────────────────────────────────────────

    const currentCategory = entity?.categoryId ?? "";

    const _setCategory = (newCategoryId: DulfsFieldID): void => {
      store.dispatch(
        entityCategoryChanged({ entityId, categoryId: newCategoryId }),
      );
      api.v1.ui.updateParts(
        CATEGORIES.map((cat) => ({
          id: `${this.id}-cat-${cat.id}`,
          style:
            cat.id === newCategoryId ? CAT_STYLE_SELECTED : CAT_STYLE_DEFAULT,
        })) as Array<Partial<UIPart> & { id: string }>,
      );
    };

    const categoryBar = new SuiActionBar({
            id: `${this.id}-category-bar`,
            left: CATEGORIES.map(
              (cat) =>
                new SuiButton({
                  id: `${this.id}-cat-${cat.id}`,
                  callback: () => {
                    _setCategory(cat.id as DulfsFieldID);
                  },
                  theme: {
                    default: {
                      self: {
                        iconId: cat.icon as IconId,
                        text: cat.label,
                        style:
                          cat.id === currentCategory
                            ? CAT_STYLE_SELECTED
                            : CAT_STYLE_DEFAULT,
                      },
                    },
                  },
                }),
            ),
            theme: {
              default: {
                left: { style: { "flex-wrap": "wrap" } },
              },
            },
        });

    const parts: UIPart[] = [
      // ── Header ─────────────────────────────────────────────────────────────
      row({
        style: S.header,
        content: [
          button({
            id: `${this.id}-back`,
            iconId: "arrow-left" as IconId,
            callback: () => {
              _close();
            },
          }),
          text({
            text: `**${entity?.name ?? "Entity"}**`,
            markdown: true,
            style: S.headerName,
          }),
          button({
            id: EP.SAVE_BTN,
            text: "Save",
            style: S.saveBtn,
            callback: () => {
              _save();
            },
          }),
        ],
      }),

      // ── Category bar ───────────────────────────────────────────────────────
      await categoryBar.build(),

      // ── Name ───────────────────────────────────────────────────────────────
      textInput({
        id: EP.TITLE_INPUT,
        initialValue: entity?.name ?? "",
        placeholder: "Entity name…",
        storageKey: `story:${EDIT_PANE_TITLE}`,
        style: S.nameInput,
      }),

      // ── Summary ────────────────────────────────────────────────────────────
      text({ text: "Summary", style: S.colLabel }),
      multilineTextInput({
        id: EP.CONTENT_INPUT,
        initialValue: entity?.summary ?? "",
        placeholder: "Brief description of this entity…",
        storageKey: `story:${EDIT_PANE_CONTENT}`,
        style: S.summaryInput,
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
          style: S.sectionRow,
          content: [
            text({ text: "Content", style: S.rowLabel }),
            contentGenPart,
          ],
        }),

        // Content textarea — flushed to lorebook on Save
        multilineTextInput({
          id: L.CONTENT_INPUT,
          initialValue: "",
          placeholder: "Lorebook content…",
          storageKey: `story:${L.CONTENT_DRAFT_KEY}`,
          style: S.contentInput,
        }),

        // Keys row: label + input + gen icon button
        row({
          style: S.keysRow,
          content: [
            text({ text: "Keys", style: S.rowLabel }),
            textInput({
              id: L.KEYS_INPUT,
              initialValue: "",
              placeholder: "comma, separated, keys",
              storageKey: `story:${L.KEYS_DRAFT_KEY}`,
              style: S.keysInput,
            }),
            keysGenPart,
          ],
        }),
      );

      // Unbind (destructive — at the bottom)
      if (entryId) {
        parts.push(
          button({
            id: L.UNBIND_BTN,
            text: "✕ Unbind from Story Engine",
            style: S.unbindBtn,
            callback: () => {
              const e = store
                .getState()
                .world.entities.find((x) => x.id === entityId);
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
      id: this.id,
      style: S.container,
      content: parts,
    });
  }
}
