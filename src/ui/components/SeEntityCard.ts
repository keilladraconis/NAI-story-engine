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

    const entity = store
      .getState()
      .world.entities.find((e) => e.id === entityId);
    const name = entity?.name ?? "";
    const summary = entity?.summary ?? "";
    const iconId = entity?.categoryId
      ? CATEGORY_ICON[entity.categoryId]
      : undefined;
    const cardId = `${E.ROOT}.card`;

    // Reactively update card label when name changes
    this._watcher.watch(
      (s) => s.world.entities.find((e) => e.id === entityId)?.name ?? "",
      (newName) => {
        api.v1.ui.updateParts([
          {
            id: `${cardId}.label`,
            text: newName,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Reactively update card icon when category changes
    this._watcher.watch(
      (s) => s.world.entities.find((e) => e.id === entityId)?.categoryId ?? "",
      (newCategoryId) => {
        const newIconId = CATEGORY_ICON[newCategoryId];
        if (newIconId) {
          api.v1.ui.updateParts([
            {
              id: `${cardId}.icon`,
              iconId: newIconId,
            } as unknown as Partial<UIPart> & { id: string },
          ]);
        }
      },
    );

    // ── Draft layout ──────────────────────────────────────────────────────────

    if (lifecycle === "draft") {
      const summaryId = `${E.ROOT}-summary`;

      this._watcher.watch(
        (s) => s.world.entities.find((e) => e.id === entityId)?.summary ?? "",
        (newSummary) => {
          api.v1.ui.updateParts([{ id: summaryId, text: newSummary }]);
        },
      );

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
        storageKey: `${E.ROOT}.collapsed`,
        storageMode: "story",
      }).build();
    }

    // ── Live layout ───────────────────────────────────────────────────────────

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

    const summaryId = `${E.ROOT}-summary`;

    this._watcher.watch(
      (s) => s.world.entities.find((e) => e.id === entityId)?.summary ?? "",
      (newSummary) => {
        api.v1.ui.updateParts([{ id: summaryId, text: newSummary }]);
      },
    );

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

    return new SuiCollapsible({
      id: E.ROOT,
      header: card,
      children: [summaryText],
      initialCollapsed: true,
      storageKey: `${E.ROOT}.collapsed`,
      storageMode: "story",
    }).build();
  }
}
