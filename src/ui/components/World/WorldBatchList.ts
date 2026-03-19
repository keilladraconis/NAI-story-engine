import { defineComponent } from "nai-act";
import { RootState, WorldBatch } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { BatchSection } from "./BatchSection";

const { column } = api.v1.ui.part;

export const WorldBatchList = defineComponent<undefined, RootState>({
  id: () => IDS.WORLD.BATCH_LIST,

  build(_props, ctx) {
    return column({
      id: IDS.WORLD.BATCH_LIST,
      style: { gap: "8px" },
      content: ctx.bindList(
        IDS.WORLD.BATCH_LIST,
        (s) => s.world.batches,
        (b: WorldBatch) => b.id,
        (b: WorldBatch) => ({ component: BatchSection, props: { batchId: b.id } }),
      ),
    });
  },
});
