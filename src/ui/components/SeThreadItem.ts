/**
 * SeThreadItem — thread card in the Threads list.
 *
 * Header (SuiCard):
 *   - icon: git-branch
 *   - label: thread title — clickable, opens SeThreadEditPane
 *   - actions: lorebook toggle, reforge, delete
 *
 * Content (expanded):
 *   - Member entity names as a compact text line
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
  SuiText,
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
  lines.push("Related:")
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
      const content = buildThreadLorebookContent(group, state.world.entities);
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
    const content = buildThreadLorebookContent(group, state.world.entities);
    await api.v1.lorebook.updateEntry(group.lorebookEntryId, { text: content });
  }

  private _rebuildMemberText(): void {
    const { groupId } = this.options;
    const T = IDS.WORLD.thread(groupId);
    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    const names = (group?.entityIds ?? [])
      .map((id) => state.world.entities.find((e) => e.id === id)?.name)
      .filter((n): n is string => n !== undefined);
    api.v1.ui.updateParts([
      {
        id: T.ENTITY_LIST,
        text: names.length > 0 ? names.join(", ") : "No members yet",
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

    const memberNames = (group?.entityIds ?? [])
      .map((id) => state.world.entities.find((e) => e.id === id)?.name)
      .filter((n): n is string => n !== undefined);

    // Reactively update card label when title changes
    this._watcher.watch(
      (s) => s.world.groups.find((g) => g.id === groupId)?.title ?? "",
      (newTitle) => {
        api.v1.ui.updateParts([
          {
            id: `${T.SECTION}.card.label`,
            text: newTitle,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Reactively update member text when membership changes
    this._watcher.watch(
      (s) => {
        const g = s.world.groups.find((x) => x.id === groupId);
        return JSON.stringify({
          ids: s.world.entities.map((e) => e.id),
          members: g?.entityIds ?? [],
        });
      },
      () => {
        this._rebuildMemberText();
      },
    );

    // Re-sync lorebook content when title/summary/members change (if enabled)
    this._watcher.watch(
      (s) => {
        const g = s.world.groups.find((x) => x.id === groupId);
        if (!g?.lorebookEntryId) return null;
        return JSON.stringify({
          title: g.title,
          summary: g.summary,
          members: g.entityIds,
        });
      },
      () => {
        void this._syncLorebook();
      },
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

    const memberText = new SuiText({
      id: T.ENTITY_LIST,
      theme: {
        default: {
          self: {
            text:
              memberNames.length > 0 ? memberNames.join(", ") : "No members yet",
            style: { "font-size": "0.85em", opacity: "0.6" },
          },
        },
      },
    });

    return new SuiCollapsible({
      id: T.SECTION,
      header: headerCard,
      children: [memberText],
      initialCollapsed: true,
      storageKey: `story:${STORAGE_KEYS.worldGroupSectionUI(groupId)}`,
      storageMode: "story",
    }).build();
  }
}
