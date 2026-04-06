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
 *   - Draft: full summary text
 *   - Live:  secondary actions (Move, Delete) + links section
 *
 * Draft: discard in actions; labelCallback opens SeEntityEditPane.
 * Live:  reforge + regen in actions; labelCallback opens SeEntityEditPane.
 */

import {
  SuiComponent,
  SuiButton,
  SuiCard,
  SuiCollapsible,
  SuiRow,
  SuiText,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  entityDiscardRequested,
  entityReforgeRequested,
  entityRegenRequested,
  entityDeleted,
  relationshipAdded,
} from "../../core/store/slices/world";
import type { Relationship } from "../../core/store/types";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeEntityEditPane } from "./SeEntityEditPane";
import { SeGenerationIconButton } from "./SeGenerationButton";
import { openMoveModal } from "./MoveModal";
import { buildSeRelationshipItem } from "./SeRelationshipItem";

// ── Local utility ──────────────────────────────────────────────────────────────

/**
 * Wraps a pre-built UIPartColumn as an AnySuiComponent so it can be used
 * as a SuiCollapsible child alongside true SuiComponent instances.
 */
class SuiRawPart extends SuiComponent<
  { default: { self: { style: object } } },
  Record<string, never>,
  SuiComponentOptions<
    { default: { self: { style: object } } },
    Record<string, never>
  >,
  UIPartColumn
> {
  constructor(
    id: string,
    private readonly _part: UIPartColumn,
  ) {
    super(
      { id, state: {} as Record<string, never> },
      { default: { self: { style: {} } } },
    );
  }
  async compose(): Promise<UIPartColumn> {
    return this._part;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId: string;
  lifecycle: "draft" | "live";
  editHost?: EditPaneHost;
} & SuiComponentOptions<SeEntityCardTheme, SeEntityCardState>;

// Applied to every action button via SuiCard actions.base — strips platform button
// chrome and sizes for finger taps without being wasteful of vertical space.
const ACTION_BASE = {
  background: "none",
  border: "none",
  padding: "6px 8px",
  margin: "0",
  opacity: "1",
} as const;

// Shared card theme — unlocks action button chrome.
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

  // ── Unified entity edit pane ───────────────────────────────────────────────

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

  // ── Links list rebuild ─────────────────────────────────────────────────────

  private async _rebuildLinksList(): Promise<void> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);
    const relationships = store
      .getState()
      .world.relationships.filter(
        (r) => r.fromEntityId === entityId || r.toEntityId === entityId,
      );
    const parts = await Promise.all(
      relationships.map((r) =>
        buildSeRelationshipItem(entityId, r.id, lifecycle),
      ),
    );
    api.v1.ui.updateParts([
      { id: E.LINKS_LIST, content: parts } as unknown as Partial<UIPart> & {
        id: string;
      },
    ]);
  }

  // ── Compose ────────────────────────────────────────────────────────────────

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

      // Reactively update full summary text in collapsible content
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

    // Rebuild links list when relationship IDs change
    this._watcher.watch(
      (s) =>
        s.world.relationships
          .filter(
            (r) => r.fromEntityId === entityId || r.toEntityId === entityId,
          )
          .map((r) => r.id),
      () => {
        void this._rebuildLinksList();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const reforgeBtn = new SuiButton({
      id: E.REFORGE_BTN,
      callback: () => {
        store.dispatch(entityReforgeRequested({ entityId }));
      },
      theme: { default: { self: { iconId: "rotate-ccw" as IconId } } },
    });

    const moveBtn = new SuiButton({
      id: E.MOVE_BTN,
      callback: () => {
        void openMoveModal(entityId, {
          getState: store.getState,
          dispatch: store.dispatch,
        });
      },
      theme: { default: { self: { iconId: "log-out" as IconId } } },
    });

    const deleteBtn = new SuiButton({
      id: E.DELETE_BTN,
      callback: () => {
        store.dispatch(entityDeleted({ entityId }));
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
      actions: [reforgeBtn, this._regenBtn!],
      theme: CARD_THEME,
    });

    // ── Summary text for live collapsible ─────────────────────────────────────

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

    // ── Secondary actions row (Move, Delete) in collapsible ───────────────────

    const secondaryActionsRow = new SuiRow({
      id: `${E.ROOT}-secondary-actions`,
      children: [moveBtn, deleteBtn],
      theme: {
        default: {
          self: {
            base: ACTION_BASE,
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0",
              padding: "2px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              marginBottom: "4px",
            },
          },
        },
      },
    });

    // ── Links section (raw UIPart, bridged to SuiComponent) ───────────────────

    const { button, textInput, column, collapsibleSection } = api.v1.ui.part;

    const relationships = store
      .getState()
      .world.relationships.filter(
        (r) => r.fromEntityId === entityId || r.toEntityId === entityId,
      );
    const initialLinkParts = await Promise.all(
      relationships.map((r) =>
        buildSeRelationshipItem(entityId, r.id, lifecycle),
      ),
    );

    const addLinkBtn = button({
      id: E.ADD_LINK_BTN,
      text: "+ Link",
      style: { "font-size": "0.8em", "align-self": "flex-start" },
      callback: () => {
        api.v1.ui.updateParts([
          {
            id: E.NEW_LINK_INPUT,
            style: { display: "flex", width: "100%", "font-size": "0.85em" },
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    });

    const newLinkInput = textInput({
      id: E.NEW_LINK_INPUT,
      placeholder: "EntityB: relationship description…",
      initialValue: "",
      storageKey: `story:${E.NEW_LINK_KEY}`,
      style: { display: "none", width: "100%", "font-size": "0.85em" },
      onSubmit: () => {
        void (async () => {
          const value = String(
            (await api.v1.storyStorage.get(E.NEW_LINK_KEY)) || "",
          ).trim();
          const sep = value.indexOf(": ");
          const targetName = sep > 0 ? value.slice(0, sep).trim() : "";
          const description = sep > 0 ? value.slice(sep + 2).trim() : "";
          const targetEntity = targetName
            ? store
                .getState()
                .world.entities.find(
                  (e) => e.name.toLowerCase() === targetName.toLowerCase(),
                )
            : undefined;
          if (targetEntity && description) {
            store.dispatch(
              relationshipAdded({
                relationship: {
                  id: api.v1.uuid(),
                  fromEntityId: entityId,
                  toEntityId: targetEntity.id,
                  description,
                } satisfies Relationship,
              }),
            );
          }
          await api.v1.storyStorage.remove(E.NEW_LINK_KEY);
          api.v1.ui.updateParts([
            {
              id: E.NEW_LINK_INPUT,
              style: { display: "none", width: "100%", "font-size": "0.85em" },
            } as unknown as Partial<UIPart> & { id: string },
          ]);
        })();
      },
    });

    const linksSection = collapsibleSection({
      id: E.LINKS_SECTION,
      title: "Links",
      iconId: "link" as IconId,
      initialCollapsed: true,
      storageKey: `story:${E.LINKS_SECTION}`,
      style: { "margin-top": "4px" },
      content: [
        column({
          style: { gap: "4px" },
          content: [
            addLinkBtn,
            newLinkInput,
            column({
              id: E.LINKS_LIST,
              style: { gap: "2px" },
              content: initialLinkParts,
            }),
          ],
        }),
      ],
    });

    const contentCol = column({
      id: `${E.ROOT}-content`,
      style: { gap: "4px", padding: "0 2px 4px" },
      content: [
        await summaryText.build(),
        await secondaryActionsRow.build(),
        linksSection,
      ],
    });

    const contentBridge = new SuiRawPart(
      `${E.ROOT}-content-bridge`,
      contentCol,
    );

    return new SuiCollapsible({
      id: E.ROOT,
      header: card,
      children: [contentBridge],
      initialCollapsed: true,
      storageKey: `${E.ROOT}.collapsed`,
      storageMode: "story",
    }).build();
  }
}
