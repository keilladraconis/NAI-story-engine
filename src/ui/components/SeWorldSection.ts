/**
 * SeWorldSection — collapsible "World" section.
 *
 * Header (SuiCard):
 *   - label: "World"
 *   - icon: globe
 *   - actions: layers icon button — creates a thread and opens SeThreadEditPane
 *
 * Body (IDS.WORLD.BODY):
 *   - SeThreadItem per WorldGroup (each shows its member entity cards inside)
 *   - Flat SeEntityCard list for live entities not in any group ("loose")
 *
 * Rebuilds body when group list, entity membership, or live entity set changes.
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { groupCreated, entityForged } from "../../core/store/slices/world";
import { FieldID } from "../../config/field-definitions";
import { IDS } from "../../ui/framework/ids";
import { ensureCategory } from "../../core/store/effects/lorebook-sync";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeEntityCard } from "./SeEntityCard";
import { SeEntityEditPane } from "./SeEntityEditPane";
import { SeThreadEditPane } from "./SeThreadEditPane";
import { SeThreadItem } from "./SeThreadItem";

type SeWorldSectionTheme = { default: { self: { style: object } } };
type SeWorldSectionState = Record<string, never>;

export type SeWorldSectionOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeWorldSectionTheme, SeWorldSectionState>;

const ACTION_BASE = {
  background: "none",
  border: "none",
  padding: "6px 8px",
  margin: "0",
  opacity: "1",
} as const;

export class SeWorldSection extends SuiComponent<
  SeWorldSectionTheme,
  SeWorldSectionState,
  SeWorldSectionOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeWorldSectionOptions) {
    super(
      { state: {} as SeWorldSectionState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  private async _rebuildBody(): Promise<void> {
    const { editHost } = this.options;
    const state = store.getState();

    const threadedEntityIds = new Set(
      state.world.groups.flatMap((g) => g.entityIds),
    );

    const threadParts = await Promise.all(
      state.world.groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const looseEntities = Object.values(state.world.entitiesById).filter(
      (e) => e.lifecycle === "live" && !threadedEntityIds.has(e.id),
    );

    const looseParts = await Promise.all(
      looseEntities.map((e) =>
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
        id: IDS.WORLD.BODY,
        content: [...threadParts, ...looseParts],
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    const { editHost } = this.options;
    const { column } = api.v1.ui.part;

    this._watcher.dispose();

    const state = store.getState();

    // Memoized: skip all serialization when entitiesById and groups refs are stable.
    let _wsEntitiesRef = state.world.entitiesById;
    let _wsGroupsRef = state.world.groups;
    let _wsCache = "";
    this._watcher.watch(
      (s) => {
        if (s.world.entitiesById === _wsEntitiesRef && s.world.groups === _wsGroupsRef) {
          return _wsCache;
        }
        _wsEntitiesRef = s.world.entitiesById;
        _wsGroupsRef = s.world.groups;
        const liveIds = Object.values(s.world.entitiesById)
          .filter((e) => e.lifecycle === "live")
          .map((e) => e.id);
        const groupSnapshot = s.world.groups.map((g) => ({
          id: g.id,
          members: [...g.entityIds],
        }));
        _wsCache = JSON.stringify({ liveIds, groupSnapshot });
        return _wsCache;
      },
      () => {
        void this._rebuildBody();
      },
    );

    const addEntityBtn = new SuiButton({
      id: `${IDS.WORLD.SECTION}-add-entity-btn`,
      callback: () => {
        void (async () => {
          const entityId = api.v1.uuid();
          const lorebookEntryId = api.v1.uuid();
          const categoryId = await ensureCategory(FieldID.DramatisPersonae);
          await api.v1.lorebook.createEntry({
            id: lorebookEntryId,
            displayName: "",
            text: "",
            keys: [],
            enabled: true,
            category: categoryId,
          });
          store.dispatch(
            entityForged({
              entity: {
                id: entityId,
                categoryId: FieldID.DramatisPersonae,
                lifecycle: "live",
                lorebookEntryId,
                name: "",
                summary: "",
              },
            }),
          );
          editHost.open(
            new SeEntityEditPane({
              id: IDS.EDIT_PANE.ROOT,
              entityId,
              lifecycle: "live",
              editHost,
            }),
          );
        })();
      },
      theme: { default: { self: { iconId: "plus" as IconId } } },
    });

    const addThreadBtn = new SuiButton({
      id: `${IDS.WORLD.SECTION}-add-thread-btn`,
      callback: () => {
        const groupId = api.v1.uuid();
        store.dispatch(
          groupCreated({
            group: { id: groupId, title: "", summary: "", entityIds: [] },
          }),
        );
        editHost.open(
          new SeThreadEditPane({
            id: IDS.EDIT_PANE.ROOT,
            groupId,
            editHost,
          }),
        );
      },
      theme: { default: { self: { iconId: "layers" as IconId } } },
    });

    const headerCard = new SuiCard({
      id: `${IDS.WORLD.SECTION}.card`,
      label: "World",
      icon: "globe" as IconId,
      actions: [addEntityBtn, addThreadBtn],
      theme: { default: { actions: { base: ACTION_BASE } } },
    });

    const threadedEntityIds = new Set(
      state.world.groups.flatMap((g) => g.entityIds),
    );

    const initialThreadParts = await Promise.all(
      state.world.groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const looseEntities = Object.values(state.world.entitiesById).filter(
      (e) => e.lifecycle === "live" && !threadedEntityIds.has(e.id),
    );

    const initialLooseParts = await Promise.all(
      looseEntities.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id, "live").ROOT,
          entityId: e.id,
          lifecycle: "live",
          editHost,
        }).build(),
      ),
    );

    const bodyCol = column({
      id: IDS.WORLD.BODY,
      style: { gap: "4px" },
      content: [...initialThreadParts, ...initialLooseParts],
    });

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
            id: `${IDS.WORLD.SECTION}-bridge`,
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
      id: IDS.WORLD.SECTION,
      header: headerCard,
      children: [new RawBridge(bodyCol)],
      initialCollapsed: false,
    }).build();
  }
}
