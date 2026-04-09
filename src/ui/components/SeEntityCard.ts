/**
 * SeEntityCard — SUI entity card using SuiCard header + SuiCollapsible content.
 *
 * Supports both "draft" and "live" lifecycle.
 *
 * Header (SuiCard):
 *   - icon: category icon
 *   - label: entity name — clickable on all cards, opens SeEntityEditPane
 *   - actions: lifecycle-specific buttons (no edit button; title is the entry point)
 *
 * Collapsible content:
 *   - Draft: full summary text + discard button
 *   - Live:  summary text + delete button
 *
 * Draft: discard in actions; labelCallback opens SeEntityEditPane.
 * Live:  regen in actions; labelCallback opens SeEntityEditPane.
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  SuiText,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  entityDiscardRequested,
  entityRegenRequested,
} from "../../core/store/slices/world";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeEntityEditPane } from "./SeEntityEditPane";
import { SeGenerationIconButton } from "./SeGenerationButton";

// ── Constants ──────────────────────────────────────────────────────────────────

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId: string;
  lifecycle: "draft" | "live";
  editHost?: EditPaneHost;
} & SuiComponentOptions<SeEntityCardTheme, SeEntityCardState>;

const ACTION_BASE = {
  background: "none",
  border: "none",
  padding: "6px 8px",
  margin: "0",
  opacity: "1",
} as const;

const CARD_THEME = {
  default: {
    actions: {
      base: ACTION_BASE,
    },
  },
};

const CATEGORY_ICON: Record<string, IconId> = {
  dramatisPersonae: "user",
  universeSystems: "cpu",
  locations: "map-pin",
  factions: "shield",
  situationalDynamics: "activity",
  topics: "hash",
};

// ── Component ──────────────────────────────────────────────────────────────────

export class SeEntityCard extends SuiComponent<
  SeEntityCardTheme,
  SeEntityCardState,
  SeEntityCardOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _regenBtn: SeGenerationIconButton | null;

  constructor(options: SeEntityCardOptions) {
    super(
      { state: {} as SeEntityCardState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    if (options.lifecycle === "live") {
      const { entityId } = options;
      this._regenBtn = new SeGenerationIconButton({
        id: IDS.entity(entityId, "live").REGEN_BTN,
        iconId: "zap" as IconId,
        requestIds: [
          `lb-entity-${entityId}-content`,
          `lb-entity-${entityId}-keys`,
        ],
        onGenerate: () => {
          store.dispatch(entityRegenRequested({ entityId }));
        },
        contentChecker: async () => {
          const e = store.getState().world.entitiesById[entityId];
          const eid = e?.lorebookEntryId;
          if (!eid) return false;
          const entry = await api.v1.lorebook.entry(eid);
          return !!(entry?.text && entry?.keys && entry.keys.length > 0);
        },
      });
    } else {
      this._regenBtn = null;
    }
  }

  private _openEditPane(): void {
    const { entityId, lifecycle, editHost } = this.options;
    if (!editHost) return;

    editHost.open(
      new SeEntityEditPane({
        id: IDS.EDIT_PANE.ROOT,
        entityId,
        lifecycle,
        editHost,
      }),
    );
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);

    this._watcher.dispose();

    const entity = store.getState().world.entitiesById[entityId];
    const name = entity?.name ?? "";
    const summary = entity?.summary ?? "";
    const iconId = entity?.categoryId
      ? CATEGORY_ICON[entity.categoryId]
      : undefined;
    const cardId = `${E.ROOT}.card`;
    const summaryId = `${E.ROOT}-summary`;

    // Reactively update card label, icon, and summary when entity data changes.
    // Memoized: direct lookup by ID — reference-stable when this entity is unmodified.
    type EntitySlice = { name: string; categoryId: string; summary: string };
    this._watcher.watch(
      (s): EntitySlice => {
        const e = s.world.entitiesById[entityId];
        return {
          name: e?.name ?? "",
          categoryId: e?.categoryId ?? "",
          summary: e?.summary ?? "",
        };
      },
      ({ name: newName, categoryId, summary: newSummary }) => {
        const parts: Array<Partial<UIPart> & { id: string }> = [
          { id: `${cardId}.label`, text: newName } as unknown as Partial<UIPart> & { id: string },
          { id: summaryId, text: newSummary } as unknown as Partial<UIPart> & { id: string },
        ];
        const newIconId = CATEGORY_ICON[categoryId];
        if (newIconId) {
          parts.push({ id: `${cardId}.icon`, iconId: newIconId } as unknown as Partial<UIPart> & { id: string });
        }
        api.v1.ui.updateParts(parts as unknown as (Partial<UIPart> & { id: string })[]);
      },
      (a, b) => a.name === b.name && a.categoryId === b.categoryId && a.summary === b.summary,
    );

    // ── Draft layout ──────────────────────────────────────────────────────────

    if (lifecycle === "draft") {
      const summaryText = new SuiText({
        id: summaryId,
        theme: {
          default: {
            self: {
              text: summary,
              style: {
                "font-size": "0.82em",
                opacity: "0.7",
                "white-space": "pre-wrap",
                "word-break": "break-word",
                "user-select": "text",
                padding: "2px 0 4px",
              },
            },
          },
        },
      });

      const discardBtn = new SuiButton({
        id: E.DISCARD_BTN,
        callback: () => {
          store.dispatch(entityDiscardRequested({ entityId }));
        },
        theme: { default: { self: { iconId: "trash" as IconId } } },
      });

      const card = new SuiCard({
        id: cardId,
        label: name,
        icon: iconId,
        labelCallback: () => {
          this._openEditPane();
        },
        actions: [discardBtn],
        theme: CARD_THEME,
      });

      return new SuiCollapsible({
        id: E.ROOT,
        header: card,
        children: [summaryText],
        initialCollapsed: false,
      }).build();
    }

    // ── Live layout ───────────────────────────────────────────────────────────

    // Check lorebook completeness for initial border style
    const entryId = entity?.lorebookEntryId ?? "";
    let hasLore = false;
    if (entryId) {
      const lbEntry = await api.v1.lorebook.entry(entryId);
      hasLore = !!(lbEntry?.text && lbEntry?.keys && lbEntry.keys.length > 0);
    }

    const LORE_BORDER = {
      "border-left": "3px solid rgb(144,238,144)",
      "padding-left": "4px",
    } as const;

    // Reactively update border when entity's lorebook requests complete.
    // Memoized: skip work when activeRequest, queue, and sega refs are stable.
    const contentReqId = `lb-entity-${entityId}-content`;
    const keysReqId = `lb-entity-${entityId}-keys`;
    let _activeReqRef = store.getState().runtime.activeRequest;
    let _queueRef = store.getState().runtime.queue;
    let _segaRef = store.getState().runtime.sega.activeRequestIds;
    let _loreCache = false;
    this._watcher.watch(
      (s): boolean => {
        if (
          s.runtime.activeRequest === _activeReqRef &&
          s.runtime.queue === _queueRef &&
          s.runtime.sega.activeRequestIds === _segaRef
        ) {
          return _loreCache;
        }
        _activeReqRef = s.runtime.activeRequest;
        _queueRef = s.runtime.queue;
        _segaRef = s.runtime.sega.activeRequestIds;
        const activeId = s.runtime.activeRequest?.id;
        _loreCache =
          activeId === contentReqId ||
          activeId === keysReqId ||
          s.runtime.sega.activeRequestIds.includes(contentReqId) ||
          s.runtime.sega.activeRequestIds.includes(keysReqId) ||
          s.runtime.queue.some((q) => q.id === contentReqId || q.id === keysReqId);
        return _loreCache;
      },
      async (isActive) => {
        if (!isActive) {
          const e = store.getState().world.entitiesById[entityId];
          const eid = e?.lorebookEntryId;
          if (!eid) return;
          const lbEntry = await api.v1.lorebook.entry(eid);
          const nowHasLore = !!(
            lbEntry?.text &&
            lbEntry?.keys &&
            lbEntry.keys.length > 0
          );
          api.v1.ui.updateParts([
            {
              id: E.ROOT,
              style: nowHasLore ? LORE_BORDER : {},
            } as unknown as Partial<UIPart> & { id: string },
          ]);
        }
      },
    );

    const card = new SuiCard({
      id: cardId,
      label: name,
      icon: iconId,
      labelCallback: () => {
        this._openEditPane();
      },
      actions: [this._regenBtn!],
      theme: CARD_THEME,
    });

    const summaryText = new SuiText({
      id: summaryId,
      theme: {
        default: {
          self: {
            text: summary,
            style: {
              "font-size": "0.82em",
              opacity: "0.7",
              "white-space": "pre-wrap",
              "word-break": "break-word",
              "user-select": "text",
              padding: "2px 0 4px",
            },
          },
        },
      },
    });

    const { column } = api.v1.ui.part;
    const collapsible = await new SuiCollapsible({
      id: `${E.ROOT}-c`,
      header: card,
      children: [summaryText],
      initialCollapsed: true,
    }).build();

    return column({
      id: E.ROOT,
      style: hasLore ? LORE_BORDER : {},
      content: [collapsible],
    });
  }
}
