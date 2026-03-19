import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { entityReforged, entityDeleted, entityRegenRequested } from "../../../core/store/slices/world";
import { IDS } from "../../framework/ids";

const { row, text, button, column } = api.v1.ui.part;

export interface EntityRowProps {
  entityId: string;
}

export const EntityRow = defineComponent<EntityRowProps, RootState>({
  id: (props) => IDS.WORLD.entity(props.entityId).ROOT,

  styles: {
    nameText: { flex: "1", "font-size": "0.85em", "font-weight": "bold" },
    summaryText: { "font-size": "0.8em", opacity: "0.7", flex: "2" },
    expandBtn: { padding: "2px 4px", "font-size": "0.75em", opacity: "0.5", "flex-shrink": "0" },
    actionBar: { gap: "4px", "padding-top": "4px" },
    actionBarHidden: { gap: "4px", "padding-top": "4px", display: "none" },
    actionBtn: { flex: "1", "font-size": "0.8em", padding: "3px 6px" },
    deleteBtn: { flex: "1", "font-size": "0.8em", padding: "3px 6px", opacity: "0.7" },
  },

  build(props, ctx) {
    const { dispatch } = ctx;
    const E = IDS.WORLD.entity(props.entityId);
    const entity = ctx.getState().world.entities.find((e) => e.id === props.entityId);

    const name = entity?.name ?? "_Unknown_";
    const summary = entity?.summary ?? "";

    let expanded = false;

    const toggleExpand = () => {
      expanded = !expanded;
      api.v1.ui.updateParts([
        { id: E.ACTION_BAR, style: expanded ? this.style?.("actionBar") : this.style?.("actionBarHidden") },
        { id: `${E.ROOT}-expand-btn`, text: expanded ? "▲" : "▼" },
      ]);
    };

    const actionBar = row({
      id: E.ACTION_BAR,
      style: this.style?.("actionBarHidden"),
      content: [
        button({
          id: E.REFORGE_BTN,
          text: "⟲ Reforge",
          style: this.style?.("actionBtn"),
          callback: () => dispatch(entityReforged({ entityId: props.entityId })),
        }),
        button({
          id: E.REGEN_BTN,
          text: "⚡ Regen",
          style: this.style?.("actionBtn"),
          callback: () => dispatch(entityRegenRequested({ entityId: props.entityId })),
        }),
        button({
          id: E.DELETE_BTN,
          text: "✕ Delete",
          style: this.style?.("deleteBtn"),
          callback: () => dispatch(entityDeleted({ entityId: props.entityId })),
        }),
      ],
    });

    return column({
      id: E.ROOT,
      style: { gap: "0px" },
      content: [
        row({
          style: { "align-items": "center", gap: "6px" },
          content: [
            text({ text: name, style: this.style?.("nameText") }),
            text({ text: summary, style: this.style?.("summaryText") }),
            button({
              id: `${E.ROOT}-expand-btn`,
              text: "▼",
              style: this.style?.("expandBtn"),
              callback: toggleExpand,
            }),
          ],
        }),
        actionBar,
      ],
    });
  },
});
