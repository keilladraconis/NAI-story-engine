/**
 * SeThreadItem — thread card in the World section.
 *
 * Header (SuiCard):
 *   - icon: layers
 *   - label: thread title — clickable, opens SeThreadEditPane
 *   - actions: lorebook toggle, reforge, delete
 *
 * Content (expanded):
 *   - SeEntityCard for each member entity
 *
 * Lorebook toggle:
 *   - ON  → creates "SE: Threads" lorebook entry with synthetic content
 *   - OFF → removes the lorebook entry
 *   - Reactively re-syncs content when title, summary, or members change
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  SuiToggle,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  groupDeleted,
  groupLorebookEntrySet,
  groupReforgeRequested,
} from "../../core/store/slices/world";
import type { WorldEntity, WorldGroup } from "../../core/store/types";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeEntityCard } from "./SeEntityCard";
import { SeThreadEditPane } from "./SeThreadEditPane";

type SeThreadItemTheme = { default: { self: { style: object } } };
type SeThreadItemState = Record<string, never>;

export type SeThreadItemOptions = {
  groupId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<SeThreadItemTheme, SeThreadItemState>;

const ACTION_BASE = {
  background: "none",
  border: "none",
  padding: "6px 8px",
  margin: "0",
  opacity: "1",
} as const;

const THREADS_LOREBOOK_CATEGORY = "SE: Threads";

const LORE_BORDER_GREEN = {
  "border-left": "3px solid rgb(144,238,144)",
  "padding-left": "4px",
} as const;
const LORE_BORDER_YELLOW = {
  "border-left": "3px solid rgb(245,243,194)",
  "padding-left": "4px",
} as const;

async function computeThreadLoreStatus(
  groupId: string,
): Promise<"none" | "some" | "all"> {
  const state = store.getState();
  const group = state.world.groups.find((g) => g.id === groupId);
  const liveMembers = (group?.entityIds ?? [])
    .map((id) => state.world.entitiesById[id])
    .filter(
      (e): e is WorldEntity => e !== undefined && e.lifecycle === "live",
    );

  if (liveMembers.length === 0) return "none";

  const loreChecks = await Promise.all(
    liveMembers.map(async (entity) => {
      if (!entity.lorebookEntryId) return false;
      const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
      return !!(entry?.text && entry?.keys && entry.keys.length > 0);
    }),
  );

  const loredCount = loreChecks.filter(Boolean).length;
  if (loredCount === 0) return "none";
  if (loredCount === liveMembers.length) return "all";
  return "some";
}

async function ensureThreadsCategory(): Promise<string> {
  const categories = await api.v1.lorebook.categories();
  const existing = categories.find((c) => c.name === THREADS_LOREBOOK_CATEGORY);
  if (existing) return existing.id;
  const erato = (await api.v1.config.get("erato_compatibility")) || false;
  return api.v1.lorebook.createCategory({
    id: api.v1.uuid(),
    name: THREADS_LOREBOOK_CATEGORY,
    enabled: true,
    settings: erato ? {} : { entryHeader: "----" },
  });
}

function buildThreadLorebookContent(
  group: WorldGroup,
  entities: WorldEntity[],
): string {
  const members = group.entityIds
    .map((id) => entities.find((e) => e.id === id))
    .filter((e): e is WorldEntity => e !== undefined);
  const lines: string[] = [group.title, "Type: thread"];
  if (group.summary) lines.push(group.summary);
  lines.push("Related:");
  for (const entity of members) {
    lines.push(`- ${entity.name}`);
  }
  return lines.join("\n");
}

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

  private async _handleLorebookToggle(): Promise<void> {
    const { groupId } = this.options;
    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    if (!group) return;

    if (group.lorebookEntryId) {
      await api.v1.lorebook.removeEntry(group.lorebookEntryId);
      store.dispatch(groupLorebookEntrySet({ groupId, entryId: undefined }));
    } else {
      const categoryId = await ensureThreadsCategory();
      const content = buildThreadLorebookContent(group, Object.values(state.world.entitiesById));
      const entryId = await api.v1.lorebook.createEntry({
        id: api.v1.uuid(),
        displayName: group.title || "Unnamed Thread",
        text: content,
        keys: group.title ? [group.title.toLowerCase()] : [],
        enabled: true,
        category: categoryId,
      });
      store.dispatch(groupLorebookEntrySet({ groupId, entryId }));
    }
  }

  private async _syncLorebook(): Promise<void> {
    const { groupId } = this.options;
    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    if (!group?.lorebookEntryId) return;
    const content = buildThreadLorebookContent(group, Object.values(state.world.entitiesById));
    await api.v1.lorebook.updateEntry(group.lorebookEntryId, { text: content });
  }

  private async _rebuildMemberCards(): Promise<void> {
    const { groupId, editHost } = this.options;
    const T = IDS.WORLD.thread(groupId);
    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);

    const cards = await Promise.all(
      (group?.entityIds ?? []).map((entityId) => {
        const entity = state.world.entitiesById[entityId];
        const lifecycle = entity?.lifecycle ?? "live";
        return new SeEntityCard({
          id: IDS.entity(entityId, lifecycle).ROOT,
          entityId,
          lifecycle,
          editHost,
        }).build();
      }),
    );

    api.v1.ui.updateParts([
      {
        id: T.ENTITY_LIST,
        content: cards,
      } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  async compose(): Promise<UIPartColumn> {
    const { groupId, editHost } = this.options;
    const T = IDS.WORLD.thread(groupId);

    this._watcher.dispose();

    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    const title = group?.title ?? "";
    const hasLorebook = !!group?.lorebookEntryId;

    // Reactively update card label when title changes.
    // Memoized: skip .find() when groups ref is stable.
    let _groupsRef = state.world.groups;
    let _titleCache = title;
    this._watcher.watch(
      (s) => {
        if (s.world.groups === _groupsRef) return _titleCache;
        _groupsRef = s.world.groups;
        _titleCache = s.world.groups.find((g) => g.id === groupId)?.title ?? "";
        return _titleCache;
      },
      (newTitle) => {
        api.v1.ui.updateParts([
          {
            id: `${T.SECTION}.card.label`,
            text: newTitle,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Compute initial thread lore status for border
    const initialLoreStatus = await computeThreadLoreStatus(groupId);
    const initialBorderStyle =
      initialLoreStatus === "all"
        ? LORE_BORDER_GREEN
        : initialLoreStatus === "some"
          ? LORE_BORDER_YELLOW
          : {};

    // Reactively update thread border when SEGA requests change
    this._watcher.watch(
      (s) => s.runtime.sega.activeRequestIds,
      async () => {
        const status = await computeThreadLoreStatus(groupId);
        const borderStyle =
          status === "all"
            ? LORE_BORDER_GREEN
            : status === "some"
              ? LORE_BORDER_YELLOW
              : {};
        api.v1.ui.updateParts([
          {
            id: T.SECTION,
            style: borderStyle,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
      (a, b) => a === b, // reference equality — new array only when SEGA state changes
    );

    // Reactively rebuild member cards when THIS group's membership or member data changes.
    // Memoized: skip all work when both groups and entitiesById refs are stable (streaming).
    let _memberGroupsRef = state.world.groups;
    let _memberEntitiesRef = state.world.entitiesById;
    let _memberCache = "";
    this._watcher.watch(
      (s) => {
        if (s.world.groups === _memberGroupsRef && s.world.entitiesById === _memberEntitiesRef) {
          return _memberCache;
        }
        _memberGroupsRef = s.world.groups;
        _memberEntitiesRef = s.world.entitiesById;
        const g = s.world.groups.find((x) => x.id === groupId);
        const memberIds = g?.entityIds ?? [];
        _memberCache = JSON.stringify({
          members: memberIds,
          entities: memberIds.map((id) => {
            const e = s.world.entitiesById[id];
            return e ? { id: e.id, lifecycle: e.lifecycle, name: e.name } : null;
          }),
        });
        return _memberCache;
      },
      () => {
        void this._rebuildMemberCards();
      },
    );

    // Re-sync lorebook content when this group's title/summary/members change (if enabled).
    // Memoized: skip .find() when groups ref is stable.
    let _loreGroupsRef = state.world.groups;
    let _loreGroupCache = group ?? null;
    this._watcher.watch(
      (s) => {
        if (s.world.groups === _loreGroupsRef) return _loreGroupCache;
        _loreGroupsRef = s.world.groups;
        _loreGroupCache = s.world.groups.find((x) => x.id === groupId) ?? null;
        return _loreGroupCache;
      },
      (g) => {
        if (g?.lorebookEntryId) void this._syncLorebook();
      },
      (a, b) => a === b, // reference equality
    );

    const lorebookToggle = new SuiToggle({
      id: T.LOREBOOK_BTN,
      state: { on: hasLorebook },
      disabledWhileCallbackRunning: true,
      callback: () => this._handleLorebookToggle(),
    });

    const reforgeBtn = new SuiButton({
      id: T.REFORGE_BTN,
      callback: () => {
        store.dispatch(groupReforgeRequested({ groupId }));
      },
      theme: { default: { self: { iconId: "rotate-ccw" as IconId } } },
    });

    const deleteBtn = new SuiButton({
      id: T.DELETE_BTN,
      callback: () => {
        store.dispatch(groupDeleted({ groupId }));
      },
      theme: { default: { self: { iconId: "trash" as IconId } } },
    });

    const headerCard = new SuiCard({
      id: `${T.SECTION}.card`,
      label: title || "New Thread",
      icon: "layers" as IconId,
      labelCallback: () => {
        editHost.open(
          new SeThreadEditPane({
            id: IDS.EDIT_PANE.ROOT,
            groupId,
            editHost,
          }),
        );
      },
      actions: [lorebookToggle, reforgeBtn, deleteBtn],
      theme: { default: { actions: { base: ACTION_BASE } } },
    });

    // Build initial member cards
    const initialCards = await Promise.all(
      (group?.entityIds ?? []).map((entityId) => {
        const entity = state.world.entitiesById[entityId];
        const lifecycle = entity?.lifecycle ?? "live";
        return new SeEntityCard({
          id: IDS.entity(entityId, lifecycle).ROOT,
          entityId,
          lifecycle,
          editHost,
        }).build();
      }),
    );

    const { column } = api.v1.ui.part;
    const membersCol = column({
      id: T.ENTITY_LIST,
      style: { gap: "2px" },
      content: initialCards,
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
            id: `${T.SECTION}-bridge`,
            state: {} as Record<string, never>,
          },
          { default: { self: { style: {} } } },
        );
      }
      async compose(): Promise<UIPartColumn> {
        return this._col;
      }
    }

    const collapsible = await new SuiCollapsible({
      id: `${T.SECTION}-c`,
      header: headerCard,
      children: [new RawBridge(membersCol)],
      initialCollapsed: true,
      storageKey: `story:${STORAGE_KEYS.worldGroupSectionUI(groupId)}`,
      storageMode: "story",
    }).build();

    return column({
      id: T.SECTION,
      style: initialBorderStyle,
      content: [collapsible],
    });
  }
}
