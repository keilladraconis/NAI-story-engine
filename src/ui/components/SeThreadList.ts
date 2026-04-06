/**
 * SeThreadList — collapsible "Threads" section.
 *
 * Header: SuiCard "Threads" with a + button in actions.
 * Body: column of SeThreadItem instances, one per WorldGroup.
 * Rebuilds the body when the group ID list changes.
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { groupCreated } from "../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeThreadItem } from "./SeThreadItem";

type SeThreadListTheme = { default: { self: { style: object } } };
type SeThreadListState = Record<string, never>;

export type SeThreadListOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeThreadListTheme, SeThreadListState>;

const ACTION_BASE = {
  background: "none",
  border: "none",
  padding: "6px 8px",
  margin: "0",
  opacity: "1",
} as const;

const TSEC = IDS.WORLD.THREADS_SECTION;

export class SeThreadList extends SuiComponent<
  SeThreadListTheme,
  SeThreadListState,
  SeThreadListOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeThreadListOptions) {
    super(
      { state: {} as SeThreadListState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  private async _rebuildItems(): Promise<void> {
    const { editHost } = this.options;
    const groups = store.getState().world.groups;
    const items = await Promise.all(
      groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );
    api.v1.ui.updateParts([
      {
        id: `${TSEC}-items`,
        content: items,
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    const { editHost } = this.options;

    this._watcher.dispose();

    const groups = store.getState().world.groups;

    this._watcher.watch(
      (s) => s.world.groups.map((g) => g.id),
      () => {
        void this._rebuildItems();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const addBtn = new SuiButton({
      id: `${TSEC}-add-btn`,
      callback: () => {
        store.dispatch(
          groupCreated({
            group: {
              id: api.v1.uuid(),
              title: "",
              summary: "",
              entityIds: [],
            },
          }),
        );
      },
      theme: { default: { self: { iconId: "plus" as IconId } } },
    });

    const headerCard = new SuiCard({
      id: `${TSEC}.card`,
      label: "Threads",
      icon: "layers" as IconId,
      actions: [addBtn],
      theme: { default: { actions: { base: ACTION_BASE } } },
    });

    const initialItems = await Promise.all(
      groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const { column } = api.v1.ui.part;

    const itemsCol = column({
      id: `${TSEC}-items`,
      content: initialItems,
    });

    // Bridge the raw items column into SuiCollapsible children
    class RawBridge extends SuiComponent<
      { default: { self: { style: object } } },
      Record<string, never>,
      SuiComponentOptions<
        { default: { self: { style: object } } },
        Record<string, never>
      >,
      UIPartColumn
    > {
      constructor(private readonly _col: UIPartColumn) {
        super(
          {
            id: `${TSEC}-bridge`,
            state: {} as Record<string, never>,
          },
          { default: { self: { style: {} } } },
        );
      }
      async compose(): Promise<UIPartColumn> {
        return this._col;
      }
    }

    return new SuiCollapsible({
      id: TSEC,
      header: headerCard,
      children: [new RawBridge(itemsCol)],
      initialCollapsed: false,
      storageKey: `story:${STORAGE_KEYS.THREADS_SECTION_UI}`,
      storageMode: "story",
    }).build();
  }
}
