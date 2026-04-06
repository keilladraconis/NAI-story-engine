/**
 * SeWorldBatchList — SUI replacement for WorldBatchList.ts.
 *
 * Column of SeBatchSection instances, one per world batch.
 * Rebuilt via StoreWatcher when the batch ID list changes (batch added/deleted/moved).
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeBatchSection } from "./SeBatchSection";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeWorldBatchListTheme = { default: { self: { style: object } } };
type SeWorldBatchListState = Record<string, never>;

export type SeWorldBatchListOptions = {
  editHost?: EditPaneHost;
} & SuiComponentOptions<SeWorldBatchListTheme, SeWorldBatchListState>;

export class SeWorldBatchList extends SuiComponent<
  SeWorldBatchListTheme,
  SeWorldBatchListState,
  SeWorldBatchListOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeWorldBatchListOptions) {
    super(
      { state: {} as SeWorldBatchListState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  private async _rebuildBatchList(): Promise<void> {
    const { editHost } = this.options;
    const batches = store.getState().world.batches;
    const parts = await Promise.all(
      batches.map((b) =>
        new SeBatchSection({
          id: IDS.WORLD.batch(b.id).SECTION,
          batchId: b.id,
          editHost,
        }).build(),
      ),
    );
    api.v1.ui.updateParts([
      {
        id: IDS.WORLD.BATCH_LIST,
        content: parts,
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    this._watcher.dispose();

    this._watcher.watch(
      (s) => s.world.batches.map((b) => b.id),
      () => {
        void this._rebuildBatchList();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const { editHost } = this.options;
    const batches = store.getState().world.batches;
    const batchParts = await Promise.all(
      batches.map((b) =>
        new SeBatchSection({
          id: IDS.WORLD.batch(b.id).SECTION,
          batchId: b.id,
          editHost,
        }).build(),
      ),
    );

    const { column } = api.v1.ui.part;

    return column({
      id: IDS.WORLD.BATCH_LIST,
      style: { gap: "8px" },
      content: batchParts,
    });
  }
}
