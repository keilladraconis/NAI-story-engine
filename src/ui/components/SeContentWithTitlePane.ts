/**
 * SeContentWithTitlePane — Panel-mode edit form with title + content fields.
 *
 * Replaces inline SeEditableText for entities, relationships, and foundation
 * shape. The hosting pane (ForgePane) swaps its content to show this form when
 * the user clicks edit, and restores the normal view on save/back.
 *
 * Layout:
 *   [← Back] [label]            [extraControls…]
 *   Title:   [textInput]
 *   Content: [multilineTextInput]
 *            [Save]
 */

import { SuiComponent, type AnySuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { IDS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../framework/ids";

// ── Public types ─────────────────────────────────────────────────────────────

/** Callback pair for opening/closing an edit pane in a host container. */
export type EditPaneHost = {
  open:  (pane: AnySuiComponent) => void;
  close: () => void;
};

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeContentWithTitlePaneOptions = {
  title:              string;
  content:            string;
  titleLabel?:        string;
  contentLabel?:      string;
  titlePlaceholder?:  string;
  contentPlaceholder?:string;
  label?:             string;
  onSave:             (title: string, content: string) => void;
  onBack:             () => void;
  extraControls?:     UIPart[];
} & SuiComponentOptions<Theme, State>;

// ── Component ────────────────────────────────────────────────────────────────

const EP = IDS.EDIT_PANE;

export class SeContentWithTitlePane extends SuiComponent<
  Theme, State, SeContentWithTitlePaneOptions, UIPartColumn
> {
  constructor(options: SeContentWithTitlePaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
  }

  async compose(): Promise<UIPartColumn> {
    const {
      title, content, label,
      titleLabel, contentLabel,
      titlePlaceholder, contentPlaceholder,
      onSave, onBack, extraControls,
    } = this.options;

    // Seed storyStorage so storageKey-bound inputs pick up initial values
    await api.v1.storyStorage.set(EDIT_PANE_TITLE, title);
    await api.v1.storyStorage.set(EDIT_PANE_CONTENT, content);

    const { column, row, text, textInput, multilineTextInput, button } = api.v1.ui.part;

    // ── Header row ─────────────────────────────────────────────
    const headerParts: UIPart[] = [
      button({
        id:       EP.BACK_BTN,
        text:     "",
        iconId:   "arrow-left" as IconId,
        callback: () => { onBack(); },
      }),
    ];
    if (label) {
      headerParts.push(
        text({
          id:       EP.LABEL,
          text:     `**${label}**`,
          markdown: true,
          style:    { flex: "1", "font-size": "0.85em", "font-weight": "bold" },
        }),
      );
    }
    if (extraControls) headerParts.push(...extraControls);

    // ── Title input ────────────────────────────────────────────
    const titleInput = textInput({
      id:           EP.TITLE_INPUT,
      initialValue: title,
      placeholder:  titlePlaceholder ?? "Title…",
      storageKey:   `story:${EDIT_PANE_TITLE}`,
      style:        { "font-size": "0.85em" },
    });

    // ── Content input ──────────────────────────────────────────
    const contentInput = multilineTextInput({
      id:           EP.CONTENT_INPUT,
      initialValue: content,
      placeholder:  contentPlaceholder ?? "Content…",
      storageKey:   `story:${EDIT_PANE_CONTENT}`,
      style:        { "min-height": "120px", "font-size": "0.85em", flex: "1" },
    });

    // ── Save button ────────────────────────────────────────────
    const saveBtn = button({
      id:       EP.SAVE_BTN,
      text:     "Save",
      style:    { "align-self": "flex-end", padding: "4px 16px" },
      callback: () => {
        void (async () => {
          const newTitle   = String((await api.v1.storyStorage.get(EDIT_PANE_TITLE))   ?? "");
          const newContent = String((await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) ?? "");
          onSave(newTitle.trim(), newContent.trim());
        })();
      },
    });

    // ── Assemble ───────────────────────────────────────────────
    const parts: UIPart[] = [
      row({
        style:   { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
        content: headerParts,
      }),
    ];

    if (titleLabel || contentLabel) {
      parts.push(text({
        text:  titleLabel ?? "Name",
        style: LABEL_STYLE,
      }));
    }
    parts.push(titleInput);

    if (contentLabel) {
      parts.push(text({ text: contentLabel, style: LABEL_STYLE }));
    }
    parts.push(contentInput);
    parts.push(saveBtn);

    return column({
      id:      this.id,
      style:   { gap: "6px", flex: "1" },
      content: parts,
    });
  }
}

const LABEL_STYLE = {
  "font-size": "0.8em",
  "font-weight": "bold",
  opacity: "0.7",
  "margin-top": "2px",
} as const;
