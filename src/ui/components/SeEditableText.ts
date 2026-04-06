/**
 * SeEditableText — SUI replacement for EditableText.ts
 *
 * View/edit toggle. Two layout modes:
 *   multiline (default): header row (label + edit/save buttons) above, view/input stacked below
 *   singleLine:          flat row — [view OR input] [edit|save] [extraControls]
 *
 * State:
 *   editing — local to this component (no cross-component singleton coordination in Phase 1;
 *             that moves to plugin-shared state in Phase 5).
 *
 * Draft storage:
 *   Uses the existing shared storageKey (EDITABLE_DRAFT_KEY) so only one draft exists at a time.
 *   The multilineTextInput writes via storageKey; save reads via storyStorage.get.
 *
 * Optional live view update:
 *   If liveSelector is provided, a StoreWatcher subscription keeps the view text current
 *   whenever the store slice changes.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";
import { EDITABLE_DRAFT_RAW, EDITABLE_DRAFT_KEY } from "../../ui/framework/ids";

// ── Types ────────────────────────────────────────────────────────────────────

type SeEditableTextState = { editing: boolean };
type SeEditableTextTheme = { default: { self: { style: object } } };

export type SeEditableTextOptions = {
  /** Called on edit begin to retrieve current content. */
  getContent: () => string | Promise<string>;
  placeholder?: string;
  /** Called after save with the new content string. */
  onSave?: (content: string) => void;
  /** Additional controls placed alongside Edit/Save buttons. */
  extraControls?: UIPart[];
  /** Bold label shown in the multiline header row. */
  label?: string;
  /** Initial view text (markdown) shown before any save. */
  initialDisplay?: string;
  /** Formatter applied to content before display (e.g. emoji tags). */
  formatDisplay?: (content: string) => string;
  /** When provided, a StoreWatcher subscription keeps view text live. */
  liveSelector?: (s: RootState) => string;
  /** Use single-line textInput in a compact row layout. Default: false. */
  singleLine?: boolean;
} & SuiComponentOptions<SeEditableTextTheme, SeEditableTextState>;

// ── SeEditableText ────────────────────────────────────────────────────────────

export class SeEditableText extends SuiComponent<
  SeEditableTextTheme,
  SeEditableTextState,
  SeEditableTextOptions,
  UIPartRow | UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  private get _viewId(): string {
    return `${this.id}-view`;
  }
  private get _editId(): string {
    return `${this.id}-edit`;
  }
  private get _editBtnId(): string {
    return `${this.id}-edit-btn`;
  }
  private get _saveBtnId(): string {
    return `${this.id}-save-btn`;
  }

  constructor(options: SeEditableTextOptions) {
    super(
      { state: { editing: false }, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow | UIPartColumn> {
    const { liveSelector, formatDisplay, singleLine } = this.options;

    if (liveSelector) {
      this._watcher.watch(liveSelector, (content) => {
        const formatted = formatDisplay ? formatDisplay(content) : content;
        const escaped = singleLine
          ? formatted
          : formatted.replace(/\n/g, "  \n").replace(/</g, "\\<");
        api.v1.ui.updateParts([{ id: this._viewId, text: escaped }]);
      });
    }

    return singleLine ? this._buildSingleLine() : this._buildMultiline();
  }

  override async onSync(): Promise<void> {
    const { editing } = this.state;
    const { singleLine } = this.options;

    if (singleLine) {
      api.v1.ui.updateParts([
        {
          id: this._viewId,
          style: editing ? { display: "none" } : SL_STYLES.view,
        },
        {
          id: this._editId,
          style: editing ? SL_STYLES.edit : SL_STYLES.editHidden,
        },
        {
          id: this._editBtnId,
          style: editing ? SL_STYLES.btnHidden : SL_STYLES.btn,
        },
        {
          id: this._saveBtnId,
          style: editing ? SL_STYLES.btn : SL_STYLES.btnHidden,
        },
      ]);
    } else {
      api.v1.ui.updateParts([
        {
          id: this._viewId,
          style: editing ? { display: "none" } : ML_STYLES.view,
        },
        {
          id: this._editId,
          style: editing ? ML_STYLES.edit : ML_STYLES.editHidden,
        },
        { id: this._editBtnId, style: editing ? { display: "none" } : {} },
        { id: this._saveBtnId, style: editing ? {} : { display: "none" } },
      ]);

      // Auto-size the textarea when opening
      if (editing) {
        const content = String(
          (await api.v1.storyStorage.get(EDITABLE_DRAFT_RAW)) || "",
        );
        const newlines = (content.match(/\n/g) || []).length;
        const wrappedLines = Math.ceil(content.length / 50);
        const lines = Math.max(newlines + 1, wrappedLines, 4);
        const height = `${Math.min(lines * 18, 400)}px`;
        api.v1.ui.updateParts([
          {
            id: this._editId,
            style: { ...ML_STYLES.edit, "min-height": height },
          },
        ]);
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────

  private async _beginEdit(): Promise<void> {
    const content = String((await this.options.getContent()) || "");
    await api.v1.storyStorage.set(EDITABLE_DRAFT_RAW, content);
    await this.setState({ editing: true });
  }

  private async _save(): Promise<void> {
    const content = String(
      (await api.v1.storyStorage.get(EDITABLE_DRAFT_RAW)) || "",
    );
    const { formatDisplay, onSave, singleLine } = this.options;
    const displayText = formatDisplay ? formatDisplay(content) : content;
    const escaped = singleLine
      ? displayText
      : displayText.replace(/\n/g, "  \n").replace(/</g, "\\<");
    api.v1.ui.updateParts([{ id: this._viewId, text: escaped }]);
    await this.setState({ editing: false });
    onSave?.(content);
  }

  // ── Builders ──────────────────────────────────────────────

  private _buildInitialViewText(): string | undefined {
    const { getContent, formatDisplay, initialDisplay, singleLine } =
      this.options;
    if (formatDisplay) {
      const raw = getContent();
      if (typeof raw === "string") {
        const formatted = formatDisplay(raw);
        return singleLine
          ? formatted
          : formatted.replace(/\n/g, "  \n").replace(/</g, "\\<");
      }
    }
    return initialDisplay;
  }

  private _buildSingleLine(): UIPartRow {
    const { row, text, textInput, button } = api.v1.ui.part;
    const { placeholder, extraControls } = this.options;
    const viewText = this._buildInitialViewText();

    const parts: UIPart[] = [
      text({
        id: this._viewId,
        text: viewText,
        style: SL_STYLES.view,
      }),
      textInput({
        id: this._editId,
        initialValue: "",
        placeholder: placeholder || "Edit...",
        storageKey: `story:${EDITABLE_DRAFT_KEY}`,
        style: SL_STYLES.editHidden,
        onSubmit: () => {
          void this._save();
        },
      }),
      button({
        id: this._editBtnId,
        text: "",
        iconId: "edit" as IconId,
        style: SL_STYLES.btn,
        callback: () => {
          void this._beginEdit();
        },
      }),
      button({
        id: this._saveBtnId,
        text: "",
        iconId: "save" as IconId,
        style: SL_STYLES.btnHidden,
        callback: () => {
          void this._save();
        },
      }),
    ];

    if (extraControls) parts.push(...extraControls);

    return row({
      id: this.id,
      style: SL_STYLES.row,
      content: parts,
    });
  }

  private _buildMultiline(): UIPartColumn {
    const { column, row, text, multilineTextInput, button } = api.v1.ui.part;
    const { placeholder, extraControls, label } = this.options;
    const viewText = this._buildInitialViewText();

    const headerContent: UIPart[] = [];

    if (label) {
      headerContent.push(
        text({
          id: `${this.id}-label`,
          text: `**${label}**`,
          markdown: true,
          style: ML_STYLES.label,
        }),
      );
    }

    headerContent.push(
      button({
        id: this._editBtnId,
        text: "",
        iconId: "edit" as IconId,
        style: {},
        callback: () => {
          void this._beginEdit();
        },
      }),
      button({
        id: this._saveBtnId,
        text: "",
        iconId: "save" as IconId,
        style: { display: "none" },
        callback: () => {
          void this._save();
        },
      }),
    );

    if (extraControls) headerContent.push(...extraControls);

    return column({
      id: this.id,
      style: { gap: "4px" },
      content: [
        row({
          style: label ? ML_STYLES.headerRowWithLabel : ML_STYLES.headerRow,
          content: headerContent,
        }),
        text({
          id: this._viewId,
          text: viewText,
          markdown: true,
          style: ML_STYLES.view,
        }),
        multilineTextInput({
          id: this._editId,
          initialValue: "",
          placeholder: placeholder || "Edit...",
          storageKey: `story:${EDITABLE_DRAFT_KEY}`,
          style: ML_STYLES.editHidden,
        }),
      ],
    });
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const ML_STYLES = {
  view: {
    "font-size": "0.85em",
    "white-space": "pre-wrap",
    "word-break": "break-word",
    "min-height": "2em",
    "user-select": "text",
  },
  edit: { "min-height": "80px", width: "100%", "font-size": "0.85em" },
  editHidden: {
    "min-height": "80px",
    width: "100%",
    "font-size": "0.85em",
    display: "none",
  },
  headerRow: {
    "justify-content": "flex-end",
    "align-items": "center",
    gap: "4px",
  },
  headerRowWithLabel: {
    "justify-content": "space-between",
    "align-items": "center",
    gap: "4px",
  },
  label: {
    "font-size": "0.85em",
    "font-weight": "bold",
    opacity: "0.9",
    flex: "1",
  },
} as const;

const SL_STYLES = {
  row: { "align-items": "center", gap: "4px", flex: "1" },
  view: {
    "font-size": "0.85em",
    flex: "1",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
  },
  edit: { flex: "1", "font-size": "0.85em" },
  editHidden: { flex: "1", "font-size": "0.85em", display: "none" },
  btn: { "flex-shrink": "0", padding: "2px" },
  btnHidden: { "flex-shrink": "0", padding: "2px", display: "none" },
} as const;
