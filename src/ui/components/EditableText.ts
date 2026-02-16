/**
 * EditableText — Reusable view/edit toggle component.
 *
 * Shows markdown text in view mode, multiline input in edit mode.
 * Uses uiFieldEditBegin/uiFieldEditEnd actions and editModes state.
 *
 * Parent sets content via: updateParts([{ id: `${id}-view`, text }])
 * and seeds storyStorage key before showing.
 */

import { defineComponent } from "nai-act";
import { RootState } from "../../core/store/types";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../core/store/slices/ui";

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

export interface EditableTextProps {
  id: string;
  storageKey: string;
  placeholder?: string;
  /** Called after save with the new content string. */
  onSave?: (content: string) => void;
  /** Additional buttons placed in the header row alongside Edit/Save. */
  extraControls?: UIPart[];
  /** Optional bold title at the left of the header row. */
  label?: string;
  /** Initial display text (markdown). If provided, shown instead of "_No content._" on mount. */
  initialDisplay?: string;
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
    btn: {
      padding: "3px 8px",
      "font-size": "0.75em",
    },
    btnHidden: {
      padding: "3px 8px",
      "font-size": "0.75em",
      display: "none",
    },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { id, storageKey, placeholder, onSave, extraControls, label, initialDisplay } = props;

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

    // Begin edit: dispatch immediately, then async height estimation
    const beginEdit = async (): Promise<void> => {
      dispatch(uiFieldEditBegin({ id }));
      const currentText = String(
        (await api.v1.storyStorage.get(storageKey)) || "",
      );
      await api.v1.storyStorage.set(storageKey, currentText);
      const height = estimateHeight(currentText);
      api.v1.ui.updateParts([
        { id: editId, style: { ...this.style?.("edit"), "min-height": height } },
      ]);
    };

    // Save: read storyStorage, update view
    const save = async (): Promise<void> => {
      const content = String(
        (await api.v1.storyStorage.get(storageKey)) || "",
      );
      api.v1.ui.updateParts([
        { id: viewId, text: content.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._" },
      ]);
      dispatch(uiFieldEditEnd({ id }));
      if (onSave) onSave(content);
    };

    // React to edit mode changes
    useSelector(
      (s) => s.ui.editModes[id],
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
        text({ text: `**${label}**`, style: this.style?.("label"), markdown: true }),
      );
    }

    headerContent.push(
      button({
        id: editBtnId,
        text: "Edit",
        style: this.style?.("btn"),
        callback: beginEdit,
      }),
      button({
        id: saveBtnId,
        text: "Save",
        style: this.style?.("btnHidden"),
        callback: save,
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
          storageKey: `story:${storageKey}`,
          style: this.style?.("editHidden"),
        }),
      ],
    });
  },
});
