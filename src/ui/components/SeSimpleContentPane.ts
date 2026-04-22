/**
 * SeSimpleContentPane — Panel-mode edit form with a single content field.
 *
 * Used for text-only editing (e.g. Intent, brainstorm messages) where there
 * is no separate title/name field. The hosting plugin swaps its tab pane
 * content to show this form when the user clicks edit.
 *
 * Layout:
 *   [← Back] [label]            [extraControls…]
 *   Content: [multilineTextInput]
 *            [Save]
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { EDIT_PANE_CONTENT } from "../framework/ids";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeSimpleContentPaneOptions = {
  content: string;
  contentLabel?: string;
  contentPlaceholder?: string;
  label?: string;
  onSave: (content: string) => void;
  onBack: () => void;
  extraControls?: UIPart[];
} & SuiComponentOptions<Theme, State>;

// ── Component ────────────────────────────────────────────────────────────────

export class SeSimpleContentPane extends SuiComponent<
  Theme,
  State,
  SeSimpleContentPaneOptions,
  UIPartColumn
> {
  constructor(options: SeSimpleContentPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
  }

  async compose(): Promise<UIPartColumn> {
    const {
      content,
      label,
      contentLabel,
      contentPlaceholder,
      onSave,
      onBack,
      extraControls,
    } = this.options;

    // Seed storyStorage so storageKey-bound input picks up initial value
    await api.v1.storyStorage.set(EDIT_PANE_CONTENT, content);

    const { column, row, text, multilineTextInput, button } = api.v1.ui.part;

    // ── Save callback ──────────────────────────────────────────
    const doSave = () => {
      void (async () => {
        const newContent = String(
          (await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) ?? "",
        );
        onSave(newContent.trim());
      })();
    };

    // ── Header row ─────────────────────────────────────────────
    const headerParts: UIPart[] = [
      button({
        id: `${this.id}-back`,
        text: "",
        iconId: "arrow-left" as IconId,
        callback: () => { onBack(); },
      }),
    ];
    if (label) {
      headerParts.push(
        text({
          id: `${this.id}-label`,
          text: `**${label}**`,
          markdown: true,
          style: { flex: "1", "font-size": "0.85em", "font-weight": "bold" },
        }),
      );
    }
    if (extraControls) headerParts.push(...extraControls);
    headerParts.push(
      button({
        id: `${this.id}-save`,
        text: "Save",
        style: { padding: "4px 16px" },
        callback: doSave,
      }),
    );

    // ── Content input ──────────────────────────────────────────
    const contentInput = multilineTextInput({
      id: `${this.id}-input`,
      initialValue: content,
      placeholder: contentPlaceholder ?? "Content…",
      storageKey: `story:${EDIT_PANE_CONTENT}`,
      style: { "min-height": "120px", "font-size": "0.85em", flex: "1" },
    });

    // ── Assemble ───────────────────────────────────────────────
    const parts: UIPart[] = [
      row({
        style: { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
        content: headerParts,
      }),
    ];

    if (contentLabel) {
      parts.push(text({ text: contentLabel, style: LABEL_STYLE }));
    }
    parts.push(contentInput);

    return column({
      id: this.id,
      style: { gap: "6px", flex: "1" },
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
