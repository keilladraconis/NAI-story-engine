import { defineComponent } from "nai-act";
import { RootState, WorldEntity } from "../../../core/store/types";
import { batchReforgeRequested } from "../../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { EntityRow } from "./EntityRow";

const { column, row, text, button, collapsibleSection } = api.v1.ui.part;

export interface BatchSectionProps {
  batchId: string;
}

export const BatchSection = defineComponent<BatchSectionProps, RootState>({
  id: (props) => IDS.WORLD.batch(props.batchId).SECTION,

  styles: {
    reforgeBtn: { padding: "3px 8px", "font-size": "0.8em", "flex-shrink": "0" },
    batchHeader: { "align-items": "center", gap: "6px", "margin-bottom": "4px" },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const B = IDS.WORLD.batch(props.batchId);
    const state = ctx.getState();
    const batch = state.world.batches.find((b) => b.id === props.batchId);
    const batchName = batch?.name ?? "Batch";
    const liveCount = state.world.entities.filter(
      (e) => e.batchId === props.batchId && e.lifecycle === "live",
    ).length;

    // Reactively update section title when entity count or name changes
    useSelector(
      (s) => {
        const b = s.world.batches.find((b) => b.id === props.batchId);
        const count = s.world.entities.filter(
          (e) => e.batchId === props.batchId && e.lifecycle === "live",
        ).length;
        return `${b?.name ?? "Batch"} (${count})`;
      },
      (title) => {
        api.v1.ui.updateParts([{ id: B.SECTION, title }]);
      },
    );

    const entityList = column({
      id: B.ENTITY_LIST,
      style: { gap: "4px" },
      content: ctx.bindList(
        B.ENTITY_LIST,
        (s) => s.world.entities.filter((e) => e.batchId === props.batchId && e.lifecycle === "live"),
        (e: WorldEntity) => e.id,
        (e: WorldEntity) => ({ component: EntityRow, props: { entityId: e.id } }),
      ),
    });

    const reforgeBtn = button({
      id: B.REFORGE_BTN,
      text: "⟲ Reforge",
      style: this.style?.("reforgeBtn"),
      callback: () => dispatch(batchReforgeRequested({ batchId: props.batchId })),
    });

    return collapsibleSection({
      id: B.SECTION,
      title: `${batchName} (${liveCount})`,
      storageKey: STORAGE_KEYS.worldBatchSectionUI(props.batchId),
      content: [
        column({
          style: { gap: "4px" },
          content: [
            row({
              style: this.style?.("batchHeader"),
              content: [
                text({ text: `**${batchName}**`, markdown: true, style: { flex: "1" } }),
                reforgeBtn,
              ],
            }),
            entityList,
          ],
        }),
      ],
    });
  },
});
