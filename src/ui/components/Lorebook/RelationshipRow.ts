import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { relationshipRemoved } from "../../../core/store/slices/world";
import { IDS } from "../../framework/ids";

const { row, text, button } = api.v1.ui.part;

export interface RelationshipRowProps {
  relId: string;
  fromName: string;
  toName: string;
  description: string;
}

export const RelationshipRow = defineComponent<RelationshipRowProps, RootState>({
  id: (props) => IDS.LOREBOOK.relationship(props.relId).ROOT,

  styles: {
    row: { gap: "6px", "align-items": "center", padding: "2px 0", "font-size": "0.85em" },
    relText: { flex: "1", opacity: "0.9" },
    deleteBtn: { padding: "1px 6px", opacity: "0.6", "font-size": "0.85em", "flex-shrink": "0" },
  },

  build(props, ctx) {
    const { dispatch } = ctx;
    const R = IDS.LOREBOOK.relationship(props.relId);

    return row({
      id: R.ROOT,
      style: this.style?.("row"),
      content: [
        text({
          text: `${props.fromName} → ${props.toName}: ${props.description}`,
          style: this.style?.("relText"),
        }),
        button({
          id: R.DELETE_BTN,
          text: "✕",
          style: this.style?.("deleteBtn"),
          callback: () => dispatch(relationshipRemoved({ relationshipId: props.relId })),
        }),
      ],
    });
  },
});
