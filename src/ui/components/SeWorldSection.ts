/**
 * SeWorldSection — collapsible "World" section listing live entities
 * and embedding SeThreadList beneath them.
 *
 * Mirrors the structure of SeForgeSection but for live (cast) entities.
 * Rebuilds the entity list via updateParts when live entity IDs change.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeEntityCard } from "./SeEntityCard";
import { SeThreadList } from "./SeThreadList";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeWorldSectionTheme = { default: { self: { style: object } } };
type SeWorldSectionState = Record<string, never>;

export type SeWorldSectionOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeWorldSectionTheme, SeWorldSectionState>;

export class SeWorldSection extends SuiComponent<
  SeWorldSectionTheme,
  SeWorldSectionState,
  SeWorldSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher: StoreWatcher;
  private readonly _threadList: SeThreadList;

  constructor(options: SeWorldSectionOptions) {
    super(
      { state: {} as SeWorldSectionState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._threadList = new SeThreadList({
      id: IDS.WORLD.THREAD_LIST,
      editHost: options.editHost,
    });
  }

  private async _rebuildEntityList(): Promise<void> {
    const { editHost } = this.options;
    const liveEntities = store
      .getState()
      .world.entities.filter((e) => e.lifecycle === "live");
    const parts = await Promise.all(
      liveEntities.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id, "live").ROOT,
          entityId: e.id,
          lifecycle: "live",
          editHost,
        }).build(),
      ),
    );
    api.v1.ui.updateParts([
      {
        id: IDS.WORLD.ENTITY_LIST,
        content: parts,
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const { column, collapsibleSection } = api.v1.ui.part;
    const { editHost } = this.options;

    this._watcher.dispose();

    this._watcher.watch(
      (s) =>
        s.world.entities
          .filter((e) => e.lifecycle === "live")
          .map((e) => e.id),
      () => {
        void this._rebuildEntityList();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const liveEntities = store
      .getState()
      .world.entities.filter((e) => e.lifecycle === "live");

    const initialEntityParts = await Promise.all(
      liveEntities.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id, "live").ROOT,
          entityId: e.id,
          lifecycle: "live",
          editHost,
        }).build(),
      ),
    );

    const threadListPart = await this._threadList.build();

    return collapsibleSection({
      id: IDS.WORLD.SECTION,
      title: "World",
      storageKey: `story:${STORAGE_KEYS.WORLD_SECTION_UI}`,
      content: [
        column({
          style: { gap: "6px" },
          content: [
            column({
              id: IDS.WORLD.ENTITY_LIST,
              style: { gap: "2px" },
              content: initialEntityParts,
            }),
            threadListPart,
          ],
        }),
      ],
    });
  }
}
