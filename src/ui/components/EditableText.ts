/**
 * EditableText — Reusable view/edit toggle component (singleton pattern).
 *
 * All instances share a single draft storageKey. At most one editor is
 * active at a time; activating a new one auto-saves the previous.
 *
 * Parent provides content via `getContent` (called on edit begin).
 * Parent persists via `onSave` (called on save/auto-save).
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

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

export interface EditableTextProps {
  id: string;
  getContent: () => string | Promise<string>;
  placeholder?: string;
  /** Called after save with the new content string. */
  onSave?: (content: string) => void;
  /** Additional buttons placed in the header row alongside Edit/Save. */
  extraControls?: UIPart[];
  /** Optional bold title at the left of the header row. */
  label?: string;
  /** Initial display text (markdown). If provided, shown instead of "_No content._" on mount. */
  initialDisplay?: string;
  /** Optional formatter applied to content before displaying in view mode (e.g. emoji tags). */
  formatDisplay?: (content: string) => string;
}

export const EditableText = defineComponent<EditableTextProps, RootState>({
  id: (props) => props.id,

  styles: {
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
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { id, getContent, placeholder, onSave, extraControls, label, initialDisplay, formatDisplay } = props;

    const viewId = `${id}-view`;
    const editId = `${id}-edit`;
    const editBtnId = `${id}-edit-btn`;
    const saveBtnId = `${id}-save-btn`;

    /** Estimate min-height in px from text content (~50 chars/line, 18px/line). */
    const estimateHeight = (content: string): string => {
      const newlines = (content.match(/\n/g) || []).length;
      const wrappedLines = Math.ceil(content.length / 50);
      const lines = Math.max(newlines + 1, wrappedLines, 4);
      return `${Math.min(lines * 18, 400)}px`;
    };

    // Save implementation — reads from shared draft, updates view, calls onSave
    const saveImpl = async (): Promise<void> => {
      const content = String(
        (await api.v1.storyStorage.get(EDITABLE_DRAFT_RAW)) || "",
      );
      const displayText = formatDisplay ? formatDisplay(content) : content;
      api.v1.ui.updateParts([
        { id: viewId, text: displayText.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._" },
      ]);
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
      const height = estimateHeight(content);
      api.v1.ui.updateParts([
        { id: editId, style: { ...this.style?.("edit"), "min-height": height } },
      ]);
    };

    // React to active edit changes
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
