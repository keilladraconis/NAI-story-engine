/**
 * EditableText — Reusable view/edit toggle component (singleton pattern).
 *
 * All instances share a single draft storageKey. At most one editor is
 * active at a time; activating a new one auto-saves the previous.
 *
 * Parent provides content via `getContent` (called on edit begin).
 * Parent persists via `onSave` (called on save/auto-save).
 *
 * Two layout modes:
 *  - multiline (default): header row with buttons above, view/input stacked below
 *  - singleLine: flat row — [view OR input] [edit|save] [extraControls]
 */

import { defineComponent } from "nai-act";
import { RootState } from "../../core/store/types";
import {
  uiEditableActivate,
  uiEditableDeactivate,
} from "../../core/store/slices/ui";
import { EDITABLE_DRAFT_RAW, EDITABLE_DRAFT_KEY } from "../framework/ids";
import {
  flushActiveEditor,
  registerActiveEditor,
  clearActiveEditor,
} from "../framework/editable-draft";

const { text, row, column, button, multilineTextInput, textInput } = api.v1.ui.part;

export interface EditableTextProps {
  id: string;
  getContent: () => string | Promise<string>;
  placeholder?: string;
  /** Called after save with the new content string. */
  onSave?: (content: string) => void;
  /** Additional buttons placed alongside Edit/Save. */
  extraControls?: UIPart[];
  /** Optional bold title at the left of the header row (multiline only). */
  label?: string;
  /** Initial display text (markdown). If provided, shown instead of "_No content._" on mount. */
  initialDisplay?: string;
  /** Optional formatter applied to content before displaying in view mode (e.g. emoji tags). */
  formatDisplay?: (content: string) => string;
  /** Use single-line textInput in a compact row layout. Default: false (multiline). */
  singleLine?: boolean;
}

export const EditableText = defineComponent<EditableTextProps, RootState>({
  id: (props) => props.id,

  styles: {
    // --- Multiline styles ---
    view: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      "min-height": "2em",
      "user-select": "text",
    },
    viewHidden: {
      display: "none",
    },
    edit: {
      "min-height": "80px",
      width: "100%",
      "font-size": "0.85em",
    },
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
    btn: {},
    btnHidden: {
      display: "none",
    },
    // --- Single-line styles ---
    slRow: {
      "align-items": "center",
      gap: "4px",
      flex: "1",
    },
    slView: {
      "font-size": "0.85em",
      flex: "1",
      overflow: "hidden",
      "text-overflow": "ellipsis",
      "white-space": "nowrap",
    },
    slEdit: {
      flex: "1",
      "font-size": "0.85em",
    },
    slEditHidden: {
      flex: "1",
      "font-size": "0.85em",
      display: "none",
    },
    slBtn: {
      "flex-shrink": "0",
      padding: "2px",
    },
    slBtnHidden: {
      "flex-shrink": "0",
      padding: "2px",
      display: "none",
    },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { id, getContent, placeholder, onSave, extraControls, label, initialDisplay, formatDisplay, singleLine } = props;

    const viewId = `${id}-view`;
    const editId = `${id}-edit`;
    const editBtnId = `${id}-edit-btn`;
    const saveBtnId = `${id}-save-btn`;

    // Save implementation — reads from shared draft, updates view, calls onSave
    const saveImpl = async (): Promise<void> => {
      const content = String(
        (await api.v1.storyStorage.get(EDITABLE_DRAFT_RAW)) || "",
      );
      const displayText = formatDisplay ? formatDisplay(content) : content;
      const escaped = singleLine
        ? (displayText || "_No content._")
        : (displayText.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._");
      api.v1.ui.updateParts([{ id: viewId, text: escaped }]);
      clearActiveEditor();
      dispatch(uiEditableDeactivate());
      if (onSave) onSave(content);
    };

    // Begin edit: flush previous editor, load content, activate
    const beginEdit = async (): Promise<void> => {
      await flushActiveEditor();
      const content = String((await getContent()) || "");
      await api.v1.storyStorage.set(EDITABLE_DRAFT_RAW, content);
      registerActiveEditor(saveImpl);
      dispatch(uiEditableActivate({ id }));
      if (!singleLine) {
        const newlines = (content.match(/\n/g) || []).length;
        const wrappedLines = Math.ceil(content.length / 50);
        const lines = Math.max(newlines + 1, wrappedLines, 4);
        const height = `${Math.min(lines * 18, 400)}px`;
        api.v1.ui.updateParts([
          { id: editId, style: { ...this.style?.("edit"), "min-height": height } },
        ]);
      }
    };

    // --- Single-line layout ---
    if (singleLine) {
      useSelector(
        (s) => s.ui.activeEditId === id,
        (isEditing) => {
          api.v1.ui.updateParts([
            { id: viewId, style: isEditing ? this.style?.("viewHidden") : this.style?.("slView") },
            { id: editId, style: isEditing ? this.style?.("slEdit") : this.style?.("slEditHidden") },
            { id: editBtnId, style: isEditing ? this.style?.("slBtnHidden") : this.style?.("slBtn") },
            { id: saveBtnId, style: isEditing ? this.style?.("slBtn") : this.style?.("slBtnHidden") },
          ]);
        },
      );

      const parts: UIPart[] = [
        text({
          id: viewId,
          text: initialDisplay || "_No content._",
          style: this.style?.("slView"),
        }),
        textInput({
          id: editId,
          initialValue: "",
          placeholder: placeholder || "Edit...",
          storageKey: EDITABLE_DRAFT_KEY,
          style: this.style?.("slEditHidden"),
          onSubmit: () => { saveImpl(); },
        }),
        button({
          id: editBtnId,
          text: "",
          iconId: "edit",
          style: this.style?.("slBtn"),
          callback: beginEdit,
        }),
        button({
          id: saveBtnId,
          text: "",
          iconId: "save",
          style: this.style?.("slBtnHidden"),
          callback: saveImpl,
        }),
      ];

      if (extraControls) {
        parts.push(...extraControls);
      }

      return row({
        id,
        style: this.style?.("slRow"),
        content: parts,
      });
    }

    // --- Multiline layout ---
    useSelector(
      (s) => s.ui.activeEditId === id,
      (isEditing) => {
        api.v1.ui.updateParts([
          { id: viewId, style: isEditing ? this.style?.("viewHidden") : this.style?.("view") },
          { id: editId, style: isEditing ? this.style?.("edit") : this.style?.("editHidden") },
          { id: editBtnId, style: isEditing ? this.style?.("btnHidden") : this.style?.("btn") },
          { id: saveBtnId, style: isEditing ? this.style?.("btn") : this.style?.("btnHidden") },
        ]);
      },
    );

    const headerContent: UIPart[] = [];

    if (label) {
      headerContent.push(
        text({ id: `${id}-label`, text: `**${label}**`, style: this.style?.("label"), markdown: true }),
      );
    }

    headerContent.push(
      button({
        id: editBtnId,
        text: "",
        iconId: "edit",
        style: this.style?.("btn"),
        callback: beginEdit,
      }),
      button({
        id: saveBtnId,
        text: "",
        iconId: "save",
        style: this.style?.("btnHidden"),
        callback: saveImpl,
      }),
    );

    if (extraControls) {
      headerContent.push(...extraControls);
    }

    return column({
      id,
      style: { gap: "4px" },
      content: [
        row({
          style: label ? this.style?.("headerRowWithLabel") : this.style?.("headerRow"),
          content: headerContent,
        }),
        text({
          id: viewId,
          text: initialDisplay || "_No content._",
          markdown: true,
          style: this.style?.("view"),
        }),
        multilineTextInput({
          id: editId,
          initialValue: "",
          placeholder: placeholder || "Edit...",
          storageKey: EDITABLE_DRAFT_KEY,
          style: this.style?.("editHidden"),
        }),
      ],
    });
  },
});
