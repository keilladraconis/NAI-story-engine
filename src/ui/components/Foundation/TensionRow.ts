import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { tensionEdited, tensionResolved, tensionDeleted } from "../../../core/store/slices/foundation";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { escapeForMarkdown } from "../../utils";

const { row, button, column, text } = api.v1.ui.part;

export interface TensionRowProps {
  tensionId: string;
  initialText: string;
  resolved: boolean;
}

export const TensionRow = defineComponent<TensionRowProps, RootState>({
  id: (props) => IDS.FOUNDATION.tension(props.tensionId).ROOT,

  styles: {
    resolvedText: { opacity: "0.45", "font-style": "italic" },
    resolveBtn: { padding: "2px 6px", "font-size": "0.8em", "flex-shrink": "0" },
    deleteBtn: { padding: "2px 6px", "font-size": "0.8em", "flex-shrink": "0", opacity: "0.5" },
  },

  build(props, ctx) {
    const { dispatch } = ctx;
    const T = IDS.FOUNDATION.tension(props.tensionId);

    const resolveBtn = button({
      id: T.RESOLVE_BTN,
      text: "✓",
      style: this.style?.("resolveBtn"),
      callback: () => dispatch(tensionResolved({ tensionId: props.tensionId })),
    });

    const deleteBtn = button({
      id: T.DELETE_BTN,
      text: "✕",
      style: this.style?.("deleteBtn"),
      callback: () => dispatch(tensionDeleted({ tensionId: props.tensionId })),
    });

    if (props.resolved) {
      return row({
        id: T.ROOT,
        style: { gap: "4px", "align-items": "center" },
        content: [
          text({
            id: T.TEXT,
            text: escapeForMarkdown(props.initialText, "_No content._"),
            markdown: true,
            style: this.style?.("resolvedText"),
          }),
          deleteBtn,
        ],
      });
    }

    const { part: editablePart } = ctx.render(EditableText, {
      id: T.TEXT,
      getContent: () => {
        const t = ctx.getState().foundation.tensions.find((t) => t.id === props.tensionId);
        return t?.text ?? "";
      },
      placeholder: "A tension or dramatic element...",
      initialDisplay: props.initialText ? escapeForMarkdown(props.initialText) : undefined,
      onSave: (text: string) => dispatch(tensionEdited({ tensionId: props.tensionId, text })),
      extraControls: [resolveBtn, deleteBtn],
    });

    ctx.bindPart(
      `${T.TEXT}-view`,
      (s) => s.foundation.tensions.find((t) => t.id === props.tensionId)?.text,
      (text) => ({ text: text ? escapeForMarkdown(text) : "" }),
    );

    return column({ id: T.ROOT, style: { gap: "2px" }, content: [editablePart] });
  },
});
