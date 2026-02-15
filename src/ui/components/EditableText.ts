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
}

export const EditableText = defineComponent<EditableTextProps, RootState>({
  id: (props) => props.id,

  styles: {
    view: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      "min-height": "2em",
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
    btnRow: {
      gap: "4px",
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
    const { id, storageKey, placeholder } = props;

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

    // Begin edit: seed storyStorage from current view text
    const beginEdit = async (): Promise<void> => {
      const currentText = String(
        (await api.v1.storyStorage.get(storageKey)) || "",
      );
      await api.v1.storyStorage.set(storageKey, currentText);
      // Estimate height from content
      const height = estimateHeight(currentText);
      api.v1.ui.updateParts([
        { id: editId, style: { ...this.style?.("edit"), "min-height": height } },
      ]);
      dispatch(uiFieldEditBegin({ id }));
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

    return column({
      id,
      style: { gap: "4px" },
      content: [
        text({
          id: viewId,
          text: "_No content._",
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
        row({
          style: this.style?.("btnRow"),
          content: [
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
          ],
        }),
      ],
    });
  },
});
