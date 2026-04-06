/**
 * SeThreadList — column of SeThreadItem instances, one per WorldGroup.
 *
 * Includes a "+ New Thread" button at the top.
 * Rebuilds when the group ID list changes.
 */

import {
  SuiComponent,
  SuiButton,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { groupCreated } from "../../core/store/slices/world";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeThreadItem } from "./SeThreadItem";

type SeThreadListTheme = { default: { self: { style: object } } };
type SeThreadListState = Record<string, never>;

export type SeThreadListOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeThreadListTheme, SeThreadListState>;

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

  private async _rebuildList(): Promise<void> {
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
        id: `${IDS.WORLD.THREAD_LIST}-items`,
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
        void this._rebuildList();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const initialItems = await Promise.all(
      groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const newThreadBtn = new SuiButton({
      id: `${IDS.WORLD.THREAD_LIST}-new-btn`,
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
      theme: {
        default: {
          self: {
            text: "+ New Thread",
            style: { "font-size": "0.85em", "align-self": "flex-start" },
          },
        },
      },
    });

    const { column } = api.v1.ui.part;
    const btnPart = await newThreadBtn.build();

    return column({
      id: IDS.WORLD.THREAD_LIST,
      style: { gap: "6px" },
      content: [
        btnPart,
        column({
          id: `${IDS.WORLD.THREAD_LIST}-items`,
          style: { gap: "4px" },
          content: initialItems,
        }),
      ],
    });
  }
}
