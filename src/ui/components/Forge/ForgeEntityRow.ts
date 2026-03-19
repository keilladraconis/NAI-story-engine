import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { entityDiscardRequested } from "../../../core/store/slices/world";
import { IDS } from "../../framework/ids";

const { row, text, button } = api.v1.ui.part;

export interface ForgeEntityRowProps {
  entityId: string;
}

export const ForgeEntityRow = defineComponent<ForgeEntityRowProps, RootState>({
  id: (props) => IDS.FORGE.entity(props.entityId).ROOT,

  styles: {
    nameText: { flex: "1", "font-size": "0.85em" },
    discardBtn: { padding: "2px 6px", "font-size": "0.8em", opacity: "0.6", "flex-shrink": "0" },
  },

  build(props, ctx) {
    const { dispatch } = ctx;
    const E = IDS.FORGE.entity(props.entityId);
    const entity = ctx.getState().world.entities.find((e) => e.id === props.entityId);
    const name = entity?.name || "_Unnamed_";

    return row({
      id: E.ROOT,
      style: { "align-items": "center", gap: "4px", padding: "3px 0" },
      content: [
        text({ text: name, style: this.style?.("nameText") }),
        button({
          id: E.DISCARD_BTN,
          text: "✕",
          style: this.style?.("discardBtn"),
          callback: () => dispatch(entityDiscardRequested({ entityId: props.entityId })),
        }),
      ],
    });
  },
});
