/**
 * SeThreadItem — collapsible Thread (WorldGroup) editor.
 *
 * Shows:
 *   - Header: title input + delete + reforge buttons
 *   - Body: summary textarea + entity membership checklist
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  groupDeleted,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  groupReforgeRequested,
} from "../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeThreadItemTheme = { default: { self: { style: object } } };
type SeThreadItemState = Record<string, never>;

export type SeThreadItemOptions = {
  groupId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<SeThreadItemTheme, SeThreadItemState>;

const CATEGORY_LABEL: Record<string, string> = {
  dramatisPersonae: "Characters",
  universeSystems: "Systems",
  locations: "Locations",
  factions: "Factions",
  situationalDynamics: "Situations",
  topics: "Topics",
};

export class SeThreadItem extends SuiComponent<
  SeThreadItemTheme,
  SeThreadItemState,
  SeThreadItemOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeThreadItemOptions) {
    super(
      { state: {} as SeThreadItemState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  private _rebuildEntityList(): void {
    const { groupId } = this.options;
    const T = IDS.WORLD.thread(groupId);
    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    if (!group) return;

    const liveEntities = state.world.entities.filter(
      (e) => e.lifecycle === "live",
    );
    const { row, text, button } = api.v1.ui.part;

    const rows = liveEntities.map((entity) => {
      const isMember = group.entityIds.includes(entity.id);
      const label = CATEGORY_LABEL[entity.categoryId] ?? "";
      return row({
        id: `${T.ENTITY_LIST}-${entity.id}`,
        style: {
          "align-items": "center",
          gap: "6px",
          padding: "2px 0",
          "font-size": "0.85em",
        },
        content: [
          button({
            id: `${T.ENTITY_LIST}-${entity.id}-toggle`,
            text: isMember ? "✓" : "+",
            style: {
              padding: "1px 6px",
              opacity: isMember ? "1" : "0.5",
              "font-size": "0.85em",
              background: "none",
              border: "none",
            },
            callback: () => {
              store.dispatch(entityGroupToggled({ groupId, entityId: entity.id }));
            },
          }),
          text({
            text: entity.name,
            style: { flex: "1" },
          }),
          text({
            text: label,
            style: { "font-size": "0.75em", opacity: "0.5" },
          }),
        ],
      });
    });

    api.v1.ui.updateParts([
      {
        id: T.ENTITY_LIST,
        content: rows,
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    const { groupId } = this.options;
    const T = IDS.WORLD.thread(groupId);

    this._watcher.dispose();

    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    const title = group?.title ?? "";
    const summary = group?.summary ?? "";

    // Watch title changes
    this._watcher.watch(
      (s) => s.world.groups.find((g) => g.id === groupId)?.title ?? "",
      (newTitle) => {
        api.v1.ui.updateParts([
          { id: `${T.SECTION}.card.label`, text: newTitle } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Watch entity membership / live entity list changes
    this._watcher.watch(
      (s) => {
        const g = s.world.groups.find((x) => x.id === groupId);
        const live = s.world.entities.filter((e) => e.lifecycle === "live");
        return JSON.stringify({ ids: live.map((e) => e.id), members: g?.entityIds ?? [] });
      },
      () => {
        this._rebuildEntityList();
      },
    );

    const liveEntities = state.world.entities.filter(
      (e) => e.lifecycle === "live",
    );
    const { column, row, text, button, textInput, multilineTextInput } =
      api.v1.ui.part;

    const deleteBtn = new SuiButton({
      id: T.DELETE_BTN,
      callback: () => {
        store.dispatch(groupDeleted({ groupId }));
      },
      theme: { default: { self: { iconId: "trash" as IconId } } },
    });

    const reforgeBtn = new SuiButton({
      id: T.REFORGE_BTN,
      callback: () => {
        store.dispatch(groupReforgeRequested({ groupId }));
      },
      theme: { default: { self: { iconId: "rotate-ccw" as IconId } } },
    });

    const card = new SuiCard({
      id: `${T.SECTION}.card`,
      label: title || "New Thread",
      actions: [reforgeBtn, deleteBtn],
      theme: {
        default: {
          actions: { base: { background: "none", border: "none", padding: "6px 8px", margin: "0" } },
        },
      },
    });

    const titleStorageKey = `se-thread-title-${groupId}`;

    const memberRows = liveEntities.map((entity) => {
      const isMember = group?.entityIds.includes(entity.id) ?? false;
      const label = CATEGORY_LABEL[entity.categoryId] ?? "";
      return row({
        id: `${T.ENTITY_LIST}-${entity.id}`,
        style: {
          "align-items": "center",
          gap: "6px",
          padding: "2px 0",
          "font-size": "0.85em",
        },
        content: [
          button({
            id: `${T.ENTITY_LIST}-${entity.id}-toggle`,
            text: isMember ? "✓" : "+",
            style: {
              padding: "1px 6px",
              opacity: isMember ? "1" : "0.5",
              "font-size": "0.85em",
              background: "none",
              border: "none",
            },
            callback: () => {
              store.dispatch(entityGroupToggled({ groupId, entityId: entity.id }));
            },
          }),
          text({ text: entity.name, style: { flex: "1" } }),
          text({ text: label, style: { "font-size": "0.75em", opacity: "0.5" } }),
        ],
      });
    });

    const bodyCol = column({
      id: `${T.SECTION}-body`,
      style: { gap: "8px", padding: "4px 0" },
      content: [
        textInput({
          id: T.TITLE_INPUT,
          placeholder: "Thread title…",
          initialValue: title,
          storageKey: `story:${titleStorageKey}`,
          style: { "font-size": "0.9em", "font-weight": "500" },
          onChange: (value: string) => {
            store.dispatch(groupRenamed({ groupId, title: value }));
          },
        }),
        multilineTextInput({
          id: T.SUMMARY_INPUT,
          placeholder: "Describe this thread — what connects these entities…",
          initialValue: summary,
          storageKey: `story:${T.SUMMARY_INPUT}`,
          style: { "font-size": "0.85em" },
          onChange: (value: string) => {
            store.dispatch(groupSummaryUpdated({ groupId, summary: value }));
          },
        }),
        liveEntities.length > 0
          ? column({
              id: T.ENTITY_LIST,
              style: { gap: "2px", "margin-top": "4px" },
              content: memberRows,
            })
          : text({
              text: "No live entities yet. Cast entities to add them to threads.",
              style: { "font-size": "0.8em", opacity: "0.5", "font-style": "italic" },
            }),
      ],
    });

    // Bridge raw part into SuiCollapsible children
    class RawBridge extends SuiComponent<
      { default: { self: { style: object } } },
      Record<string, never>,
      SuiComponentOptions<{ default: { self: { style: object } } }, Record<string, never>>,
      UIPartColumn
    > {
      constructor(private readonly _col: UIPartColumn) {
        super({ id: `${T.SECTION}-body-bridge`, state: {} as Record<string, never> }, { default: { self: { style: {} } } });
      }
      async compose(): Promise<UIPartColumn> { return this._col; }
    }

    return new SuiCollapsible({
      id: T.SECTION,
      header: card,
      children: [new RawBridge(bodyCol)],
      initialCollapsed: true,
      storageKey: `story:${STORAGE_KEYS.worldGroupSectionUI(groupId)}`,
      storageMode: "story",
    }).build();
  }
}
