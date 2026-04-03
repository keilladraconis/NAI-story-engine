/**
 * SeBatchSection — SUI replacement for BatchSection.ts.
 *
 * Collapsible section for one world batch. Title shows "[name] (count)" and
 * updates reactively when entity count or batch name changes.
 *
 * Entity list is rebuilt via StoreWatcher + updateParts when live entity IDs
 * for this batch change. Fresh SeEntityCard(live) instances are created each rebuild.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { batchReforgeRequested } from "../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeEntityCard } from "./SeEntityCard";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeBatchSectionTheme = { default: { self: { style: object } } };
type SeBatchSectionState = Record<string, never>;

export type SeBatchSectionOptions = {
  batchId:   string;
  editHost?: EditPaneHost;
} & SuiComponentOptions<SeBatchSectionTheme, SeBatchSectionState>;

export class SeBatchSection extends SuiComponent<
  SeBatchSectionTheme,
  SeBatchSectionState,
  SeBatchSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeBatchSectionOptions) {
    super(
      { state: {} as SeBatchSectionState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  private async _rebuildEntityList(): Promise<void> {
    const { batchId, editHost } = this.options;
    const B = IDS.WORLD.batch(batchId);
    const entities = store.getState().world.entities.filter(
      e => e.batchId === batchId && e.lifecycle === "live",
    );
    const parts = await Promise.all(
      entities.map(e =>
        new SeEntityCard({ id: IDS.entity(e.id, "live").ROOT, entityId: e.id, lifecycle: "live", editHost }).build(),
      ),
    );
    api.v1.ui.updateParts([
      { id: B.ENTITY_LIST, content: parts } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const { batchId } = this.options;
    const B = IDS.WORLD.batch(batchId);

    this._watcher.dispose();

    // Reactively update title when batch name or live entity count changes
    this._watcher.watch(
      (s) => {
        const b = s.world.batches.find(b => b.id === batchId);
        const count = s.world.entities.filter(
          e => e.batchId === batchId && e.lifecycle === "live",
        ).length;
        return `${b?.name ?? "Batch"} (${count})`;
      },
      (title) => {
        api.v1.ui.updateParts([
          { id: B.SECTION, title } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Rebuild entity list when live entity IDs for this batch change
    this._watcher.watch(
      (s) => s.world.entities
        .filter(e => e.batchId === batchId && e.lifecycle === "live")
        .map(e => e.id),
      () => { void this._rebuildEntityList(); },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const state = store.getState();
    const batch = state.world.batches.find(b => b.id === batchId);
    const batchName = batch?.name ?? "Batch";
    const liveEntities = state.world.entities.filter(
      e => e.batchId === batchId && e.lifecycle === "live",
    );
    const liveCount = liveEntities.length;

    const { editHost } = this.options;
    const initialEntityParts = await Promise.all(
      liveEntities.map(e =>
        new SeEntityCard({ id: IDS.entity(e.id, "live").ROOT, entityId: e.id, lifecycle: "live", editHost }).build(),
      ),
    );

    const { collapsibleSection, column, row, button } = api.v1.ui.part;

    const reforgeBtn = button({
      id:       B.REFORGE_BTN,
      text:     "⟲ Reforge All",
      style:    { padding: "3px 8px", "font-size": "0.8em", "flex-shrink": "0" },
      callback: () => { store.dispatch(batchReforgeRequested({ batchId })); },
    });

    return collapsibleSection({
      id:         B.SECTION,
      title:      `${batchName} (${liveCount})`,
      storageKey: `story:${STORAGE_KEYS.worldBatchSectionUI(batchId)}`,
      content: [
        column({
          style: { gap: "4px" },
          content: [
            row({
              style:   { "align-items": "center", gap: "6px", "margin-bottom": "4px" },
              content: [reforgeBtn],
            }),
            column({
              id:      B.ENTITY_LIST,
              style:   { gap: "2px" },
              content: initialEntityParts,
            }),
          ],
        }),
      ],
    });
  }
}
