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
  SuiConfirmButton,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  groupCreated,
  entityForged,
  worldCleared,
} from "../../core/store/slices/world";
import { isForgeDraft } from "../../core/store/selectors/forge";
import type {
  RootState,
  WorldEntity,
  WorldGroup,
} from "../../core/store/types";
import { segaToggled } from "../../core/store/slices/runtime";
import { worldExpansionSet } from "../../core/store/slices/ui";
import { FieldID } from "../../config/field-definitions";
import { IDS } from "../../ui/framework/ids";
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
  private readonly _clearBtn: SuiConfirmButton;

  constructor(options: SeWorldSectionOptions) {
    super(
      { state: {} as SeWorldSectionState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._clearBtn = new SuiConfirmButton({
      id: `${IDS.WORLD.SECTION}-clear-btn`,
      onConfirm: async () => {
        // Lorebook entries are intentionally preserved — removing all entities
        // only detaches them from SE management. The user can re-import via
        // the Import Wizard to restore SE bindings without losing lorebook data.
        store.dispatch(worldCleared());
      },
      timeout: 4000,
      theme: {
        default: {
          self: {
            iconId: "trash-2" as IconId,
            style: { ...ACTION_BASE, opacity: "0.6" },
          },
        },
        pending: {
          self: {
            iconId: "alertTriangle" as IconId,
            style: { ...ACTION_BASE, color: "#ff5252", opacity: "1" },
          },
        },
      },
    });
  }

  /**
   * The World section shows the committed world only: live entities (loose or
   * in Threads) and any Threads that have at least one such member. In-progress
   * forge drafts live in their forge chat as inline cards, so they are filtered
   * out here — they would otherwise appear in two places at once. Threads whose
   * only members are forge drafts are hidden until those drafts are cast.
   */
  private _selectBody(state: RootState): {
    groups: WorldGroup[];
    loose: WorldEntity[];
  } {
    const isVisibleMember = (id: string): boolean => {
      const e = state.world.entitiesById[id];
      return !!e && !isForgeDraft(e);
    };
    const groups = state.world.groups.filter((g) =>
      g.entityIds.some(isVisibleMember),
    );
    const threadedEntityIds = new Set(
      state.world.groups.flatMap((g) => g.entityIds),
    );
    const loose = Object.values(state.world.entitiesById).filter(
      (e) => !threadedEntityIds.has(e.id) && !isForgeDraft(e),
    );
    return { groups, loose };
  }

  private async _rebuildBody(): Promise<void> {
    const { editHost } = this.options;
    const { groups, loose } = this._selectBody(store.getState());

    const threadParts = await Promise.all(
      groups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const looseParts = await Promise.all(
      loose.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id).ROOT,
          entityId: e.id,
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
        if (
          s.world.entitiesById === _wsEntitiesRef &&
          s.world.groups === _wsGroupsRef
        ) {
          return _wsCache;
        }
        _wsEntitiesRef = s.world.entitiesById;
        _wsGroupsRef = s.world.groups;
        // Include lifecycle: hiding forge drafts means a draft→live cast must
        // re-render the body so the now-live entity appears (its id was already
        // present, only its lifecycle changed).
        const entitySnapshot = Object.values(s.world.entitiesById).map(
          (e) => `${e.id}:${e.lifecycle}`,
        );
        const groupSnapshot = s.world.groups.map((g) => ({
          id: g.id,
          members: [...g.entityIds],
        }));
        _wsCache = JSON.stringify({ entitySnapshot, groupSnapshot });
        return _wsCache;
      },
      () => {
        void this._rebuildBody();
      },
    );

    const addEntityBtn = new SuiButton({
      id: `${IDS.WORLD.SECTION}-add-entity-btn`,
      callback: () => {
        const entityId = api.v1.uuid();
        store.dispatch(
          entityForged({
            entity: {
              id: entityId,
              categoryId: FieldID.DramatisPersonae,
              name: "",
              summary: "",
              lifecycle: "draft",
            },
          }),
        );
        editHost.open(
          new SeEntityEditPane({
            id: IDS.EDIT_PANE.ROOT,
            entityId,
            editHost,
          }),
        );
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

    const segaStartBtn = new SuiButton({
      id: `${IDS.WORLD.SECTION}-sega-start-btn`,
      callback: () => {
        store.dispatch(segaToggled());
      },
      theme: {
        default: {
          self: { text: "S.E.G.A.", iconId: "play-circle" as IconId },
        },
      },
    });

    const segaStopBtn = new SuiButton({
      id: `${IDS.WORLD.SECTION}-sega-stop-btn`,
      callback: () => {
        store.dispatch(segaToggled());
      },
      theme: {
        default: {
          self: {
            text: "S.E.G.A.",
            iconId: "fast-forward" as IconId,
            style: { display: "none", color: "#ff9800" },
          },
        },
      },
    });

    this._watcher.watch(
      (s) => s.runtime.segaRunning,
      (segaRunning) => {
        api.v1.ui.updateParts([
          {
            id: `${IDS.WORLD.SECTION}-sega-start-btn`,
            style: { ...ACTION_BASE, display: segaRunning ? "none" : "flex" },
          },
          {
            id: `${IDS.WORLD.SECTION}-sega-stop-btn`,
            style: {
              ...ACTION_BASE,
              color: "#ff9800",
              display: segaRunning ? "flex" : "none",
            },
          },
        ]);
      },
    );

    const expandCollapseId = `${IDS.WORLD.SECTION}-expand-btn`;
    const currentlyExpanded = state.ui.worldExpanded ?? true;
    const expandCollapseBtn = new SuiButton({
      id: expandCollapseId,
      callback: () => {
        const next = !(store.getState().ui.worldExpanded ?? true);
        store.dispatch(worldExpansionSet({ expanded: next }));
      },
      theme: {
        default: {
          self: {
            iconId: (currentlyExpanded ? "minimize-2" : "maximize-2") as IconId,
            style: { ...ACTION_BASE, opacity: "0.6" },
          },
        },
      },
    });

    this._watcher.watch(
      (s) => s.ui.worldExpanded ?? true,
      (expanded) => {
        api.v1.ui.updateParts([
          {
            id: expandCollapseId,
            iconId: (expanded ? "minimize-2" : "maximize-2") as IconId,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const headerCard = new SuiCard({
      id: `${IDS.WORLD.SECTION}.card`,
      label: "World",
      icon: "globe" as IconId,
      actions: [
        segaStartBtn,
        segaStopBtn,
        expandCollapseBtn,
        addEntityBtn,
        addThreadBtn,
        this._clearBtn,
      ],
      theme: { default: { actions: { base: ACTION_BASE } } },
    });

    const { groups: initialGroups, loose: initialLoose } =
      this._selectBody(state);

    const initialThreadParts = await Promise.all(
      initialGroups.map((g) =>
        new SeThreadItem({
          id: IDS.WORLD.thread(g.id).SECTION,
          groupId: g.id,
          editHost,
        }).build(),
      ),
    );

    const initialLooseParts = await Promise.all(
      initialLoose.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id).ROOT,
          entityId: e.id,
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
