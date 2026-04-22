/**
 * SeEntityCard — entity card using SuiCard header + SuiCollapsible content.
 *
 * Header (SuiCard):
 *   - icon: category icon
 *   - label: entity name — clickable, opens SeEntityEditPane
 *   - actions: regen button
 *
 * Collapsible content: summary text
 */

import {
  SuiComponent,
  SuiCard,
  SuiCollapsible,
  SuiText,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  entityRegenRequested,
} from "../../core/store/slices/world";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { colors } from "../theme";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeEntityEditPane } from "./SeEntityEditPane";
import { SeGenerationIconButton } from "./SeGenerationButton";

// ── Constants ──────────────────────────────────────────────────────────────────

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId: string;
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
  private readonly _regenBtn: SeGenerationIconButton;
  private _collapsible: SuiCollapsible | null = null;

  constructor(options: SeEntityCardOptions) {
    super(
      { state: {} as SeEntityCardState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    const { entityId, editHost } = options;
    this._regenBtn = new SeGenerationIconButton({
      id: IDS.entity(entityId).REGEN_BTN,
      iconId: "zap" as IconId,
      requestIds: [
        `se-entity-summary-${entityId}`,
        `entity-summary-bind-${entityId}`,
        `lb-entity-${entityId}-content`,
        `lb-entity-${entityId}-keys`,
      ],
      onGenerate: () => {
        void (async () => {
          const e = store.getState().world.entitiesById[entityId];
          const eid = e?.lorebookEntryId;
          if (!eid) return;
          const entry = await api.v1.lorebook.entry(eid);
          const keysOk = entry?.forceActivation || !!(entry?.keys && entry.keys.length > 0);
          const allComplete = !!e.summary && !!entry?.text && keysOk;
          if (allComplete) {
            editHost?.open(
              new SeEntityEditPane({
                id: IDS.EDIT_PANE.ROOT,
                entityId,
                editHost: editHost!,
              }),
            );
          } else {
            store.dispatch(entityRegenRequested({ entityId }));
          }
        })();
      },
      contentChecker: async () => {
        const e = store.getState().world.entitiesById[entityId];
        const eid = e?.lorebookEntryId;
        if (!eid) return false;
        const entry = await api.v1.lorebook.entry(eid);
        const keysOk = entry?.forceActivation || !!(entry?.keys && entry.keys.length > 0);
        return !!e.summary && !!entry?.text && keysOk;
      },
    });
  }

  private _openEditPane(): void {
    const { entityId, editHost } = this.options;
    if (!editHost) return;

    editHost.open(
      new SeEntityEditPane({
        id: IDS.EDIT_PANE.ROOT,
        entityId,
        editHost,
      }),
    );
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId } = this.options;
    const E = IDS.entity(entityId);

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

    const INCOMPLETE_BORDER = {
      "border-left": "2px solid rgba(128,128,128,0.4)",
      "border-radius": "2px",
      "padding-left": "4px",
    } as const;
    const COMPLETE_BORDER = {
      "border-left": "2px solid rgb(144,238,144)",
      "border-radius": "2px",
      "padding-left": "4px",
    } as const;
    const PENDING_BORDER = {
      "border-left": `2px solid ${colors.pending}`,
      "border-radius": "2px",
      "padding-left": "4px",
    } as const;

    const pendingIds = new Set([
      `se-entity-summary-${entityId}`,
      `entity-summary-bind-${entityId}`,
      `lb-entity-${entityId}-content`,
      `lb-entity-${entityId}-keys`,
    ]);

    const _isPending = (s: { runtime: { activeRequest: { id: string } | null; queue: Array<{ id: string }>; sega: { activeRequestIds: string[] } } }): boolean =>
      pendingIds.has(s.runtime.activeRequest?.id ?? "") ||
      s.runtime.sega.activeRequestIds.some((id) => pendingIds.has(id)) ||
      s.runtime.queue.some((q) => pendingIds.has(q.id));

    let _activeReqRef = store.getState().runtime.activeRequest;
    let _queueRef = store.getState().runtime.queue;
    let _segaRef = store.getState().runtime.sega.activeRequestIds;
    let _pendingCache = _isPending(store.getState());

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

    // Check completeness for initial border style
    const entryId = entity?.lorebookEntryId ?? "";
    let hasLore = false;
    if (entryId) {
      const lbEntry = await api.v1.lorebook.entry(entryId);
      const keysOk = lbEntry?.forceActivation || !!(lbEntry?.keys && lbEntry.keys.length > 0);
      hasLore = !!(lbEntry?.text && keysOk);
    }
    const isComplete = !!summary && hasLore;

    this._watcher.watch(
      (s): boolean => {
        if (
          s.runtime.activeRequest === _activeReqRef &&
          s.runtime.queue === _queueRef &&
          s.runtime.sega.activeRequestIds === _segaRef
        ) return _pendingCache;
        _activeReqRef = s.runtime.activeRequest;
        _queueRef = s.runtime.queue;
        _segaRef = s.runtime.sega.activeRequestIds;
        _pendingCache = _isPending(s);
        return _pendingCache;
      },
      async (isPending) => {
        if (isPending) {
          api.v1.ui.updateParts([
            { id: E.ROOT, style: PENDING_BORDER } as unknown as Partial<UIPart> & { id: string },
          ]);
        } else {
          const e = store.getState().world.entitiesById[entityId];
          const eid = e?.lorebookEntryId;
          let nowComplete = false;
          if (eid) {
            const lbEntry = await api.v1.lorebook.entry(eid);
            const keysOk = lbEntry?.forceActivation || !!(lbEntry?.keys && lbEntry.keys.length > 0);
            nowComplete = !!e?.summary && !!(lbEntry?.text && keysOk);
          }
          api.v1.ui.updateParts([
            { id: E.ROOT, style: nowComplete ? COMPLETE_BORDER : INCOMPLETE_BORDER } as unknown as Partial<UIPart> & { id: string },
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
      actions: [this._regenBtn],
      theme: CARD_THEME,
    });

    this._collapsible = new SuiCollapsible({
      id: `${E.ROOT}-c`,
      header: card,
      children: [summaryText],
      initialCollapsed: false,
    });
    const collapsible = await this._collapsible.build();

    // Reactively expand/collapse when the world-level toggle fires.
    const _self = this;
    this._watcher.watch(
      (s) => s.ui.worldExpanded,
      (expanded) => {
        if (expanded !== null && _self._collapsible) {
          void _self._collapsible.setState({
            ..._self._collapsible.state,
            collapsed: !expanded,
          });
        }
      },
    );

    const initialStyle = _pendingCache ? PENDING_BORDER : isComplete ? COMPLETE_BORDER : INCOMPLETE_BORDER;
    return column({ id: E.ROOT, style: initialStyle, content: [collapsible] });
  }
}
