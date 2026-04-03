/**
 * SeEntityCard — SUI entity card using SuiCard header + SuiCollapsible content.
 *
 * Supports both "draft" and "live" lifecycle.
 *
 * Header (SuiCard):
 *   - icon: category icon
 *   - label: entity name (clickable for live entities with lorebook entry)
 *   - actions: edit button + lifecycle-specific buttons
 *
 * Collapsible content:
 *   - Summary text (reactive)
 *   - Regen row + links collapsible (live only)
 *
 * Draft: edit + discard in actions; no labelCallback.
 * Live:  edit + reforge + regen + move + delete in actions;
 *        labelCallback opens SeLorebookContentPane.
 */

import { SuiComponent, SuiButton, SuiCard, SuiCollapsible, SuiText, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  entityEdited,
  entitySummaryUpdated,
  entityDiscardRequested,
  entityReforgeRequested,
  entityRegenRequested,
  entityDeleted,
  relationshipAdded,
} from "../../core/store/slices/world";
import type { Relationship } from "../../core/store/types";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeContentWithTitlePane, type EditPaneHost } from "./SeContentWithTitlePane";
import { SeLorebookContentPane } from "./SeLorebookContentPane";
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
  SuiComponentOptions<{ default: { self: { style: object } } }, Record<string, never>>,
  UIPartColumn
> {
  constructor(id: string, private readonly _part: UIPartColumn) {
    super(
      { id, state: {} as Record<string, never> },
      { default: { self: { style: {} } } },
    );
  }
  async compose(): Promise<UIPartColumn> { return this._part; }
}

// ── Constants ──────────────────────────────────────────────────────────────────

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId:  string;
  lifecycle: "draft" | "live";
  editHost?: EditPaneHost;
} & SuiComponentOptions<SeEntityCardTheme, SeEntityCardState>;

const CATEGORY_ICON: Record<string, IconId> = {
  "dramat-personae":      "user",
  "universe-systems":     "cpu",
  "locations":            "map-pin",
  "factions":             "shield",
  "situational-dynamics": "activity",
  "topics":               "hash",
};

// ── Component ──────────────────────────────────────────────────────────────────

export class SeEntityCard extends SuiComponent<
  SeEntityCardTheme,
  SeEntityCardState,
  SeEntityCardOptions,
  UIPartColumn
> {
  private readonly _watcher:  StoreWatcher;
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
        id:         IDS.entity(entityId, "live").REGEN_BTN,
        iconId:     "zap" as IconId,
        requestIds: [
          `lb-entity-${entityId}-content`,
          `lb-entity-${entityId}-keys`,
        ],
        onGenerate: () => { store.dispatch(entityRegenRequested({ entityId })); },
      });
    } else {
      this._regenBtn = null;
    }
  }

  // ── Name/summary edit pane ─────────────────────────────────────────────────

  private _openNameEdit(): void {
    const { entityId, editHost } = this.options;
    if (!editHost) return;
    const entity = store.getState().world.entities.find(e => e.id === entityId);
    if (!entity) return;

    const pane = new SeContentWithTitlePane({
      id:                 IDS.EDIT_PANE.ROOT,
      title:              entity.name,
      content:            entity.summary,
      label:              "Edit Entity",
      titleLabel:         "Name",
      contentLabel:       "Summary",
      titlePlaceholder:   "Entity name…",
      contentPlaceholder: "Summary…",
      onSave: (name, summary) => {
        const trimmedName = name || entity.name;
        const oldName = entity.name;
        store.dispatch(entityEdited({ entityId, name: trimmedName, summary }));

        if (oldName && oldName !== trimmedName) {
          const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          for (const other of store.getState().world.entities) {
            if (other.id === entityId) continue;
            const updated = other.summary.replace(pattern, trimmedName);
            if (updated !== other.summary) {
              store.dispatch(entitySummaryUpdated({ entityId: other.id, summary: updated }));
            }
          }
        }
        editHost.close();
      },
      onBack: () => { editHost.close(); },
    });

    editHost.open(pane);
  }

  // ── Lorebook content pane (live only) ──────────────────────────────────────

  private _openLorebookPane(): void {
    const { entityId, editHost } = this.options;
    if (!editHost) return;
    const entity = store.getState().world.entities.find(e => e.id === entityId);
    if (!entity?.lorebookEntryId) return;

    editHost.open(new SeLorebookContentPane({
      id:       `${IDS.EDIT_PANE.ROOT}-lb`,
      entityId,
      editHost,
    }));
  }

  // ── Links list rebuild ─────────────────────────────────────────────────────

  private async _rebuildLinksList(): Promise<void> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);
    const relationships = store.getState().world.relationships.filter(
      r => r.fromEntityId === entityId || r.toEntityId === entityId,
    );
    const parts = await Promise.all(
      relationships.map(r => buildSeRelationshipItem(entityId, r.id, lifecycle)),
    );
    api.v1.ui.updateParts([
      { id: E.LINKS_LIST, content: parts } as unknown as Partial<UIPart> & { id: string },
    ]);
  }

  // ── Compose ────────────────────────────────────────────────────────────────

  async compose(): Promise<UIPartColumn> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);

    this._watcher.dispose();

    const entity  = store.getState().world.entities.find(e => e.id === entityId);
    const name    = entity?.name ?? "";
    const iconId  = entity?.categoryId ? CATEGORY_ICON[entity.categoryId] : undefined;
    const cardId  = `${E.ROOT}.card`;
    const summaryId = `${E.ROOT}-summary`;

    // Reactively update card label when name changes
    this._watcher.watch(
      (s) => s.world.entities.find(e => e.id === entityId)?.name ?? "",
      (newName) => {
        api.v1.ui.updateParts([
          { id: `${cardId}.label`, text: newName } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    // Reactively update summary text
    this._watcher.watch(
      (s) => s.world.entities.find(e => e.id === entityId)?.summary ?? "",
      (summary) => {
        api.v1.ui.updateParts([{ id: summaryId, text: summary }]);
      },
    );

    const summaryText = new SuiText({
      id:    summaryId,
      theme: {
        default: {
          self: {
            text:  entity?.summary ?? "",
            style: { "font-size": "0.82em", opacity: "0.7", "white-space": "pre-wrap", "word-break": "break-word", "user-select": "text", padding: "2px 0 4px" },
          },
        },
      },
    });

    const editBtn = new SuiButton({
      id:       `${E.ROOT}-edit-btn`,
      callback: () => { this._openNameEdit(); },
      theme:    { default: { self: { iconId: "edit" as IconId } } },
    });

    // ── Draft layout ──────────────────────────────────────────────────────────

    if (lifecycle === "draft") {
      const discardBtn = new SuiButton({
        id:       E.DISCARD_BTN,
        callback: () => { store.dispatch(entityDiscardRequested({ entityId })); },
        theme:    { default: { self: { iconId: "trash" as IconId } } },
      });

      const card = new SuiCard({
        id:      cardId,
        label:   name,
        icon:    iconId,
        actions: [editBtn, discardBtn],
      });

      return new SuiCollapsible({
        id:               E.ROOT,
        header:           card,
        children:         [summaryText],
        initialCollapsed: false,
        storageKey:       `${E.ROOT}.collapsed`,
        storageMode:      "story",
      }).build();
    }

    // ── Live layout ───────────────────────────────────────────────────────────

    // Rebuild links list when relationship IDs change
    this._watcher.watch(
      (s) => s.world.relationships
        .filter(r => r.fromEntityId === entityId || r.toEntityId === entityId)
        .map(r => r.id),
      () => { void this._rebuildLinksList(); },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const reforgeBtn = new SuiButton({
      id:       E.REFORGE_BTN,
      callback: () => { store.dispatch(entityReforgeRequested({ entityId })); },
      theme:    { default: { self: { iconId: "rotate-ccw" as IconId } } },
    });

    const moveBtn = new SuiButton({
      id:       E.MOVE_BTN,
      callback: () => {
        void openMoveModal(entityId, { getState: store.getState, dispatch: store.dispatch });
      },
      theme: { default: { self: { iconId: "log-out" as IconId } } },
    });

    const deleteBtn = new SuiButton({
      id:       E.DELETE_BTN,
      callback: () => { store.dispatch(entityDeleted({ entityId })); },
      theme:    { default: { self: { iconId: "trash" as IconId } } },
    });

    const hasLorebookEntry = !!entity?.lorebookEntryId;

    const card = new SuiCard({
      id:            cardId,
      label:         name,
      icon:          iconId,
      labelCallback: hasLorebookEntry ? () => { this._openLorebookPane(); } : undefined,
      actions:       [editBtn, reforgeBtn, this._regenBtn!, moveBtn, deleteBtn],
    });

    // ── Links section (raw UIPart, bridged to SuiComponent) ───────────────────

    const { button, textInput, column, collapsibleSection } = api.v1.ui.part;

    const relationships = store.getState().world.relationships.filter(
      r => r.fromEntityId === entityId || r.toEntityId === entityId,
    );
    const initialLinkParts = await Promise.all(
      relationships.map(r => buildSeRelationshipItem(entityId, r.id, lifecycle)),
    );

    const addLinkBtn = button({
      id:       E.ADD_LINK_BTN,
      text:     "+ Link",
      style:    { "font-size": "0.8em", "align-self": "flex-start" },
      callback: () => {
        api.v1.ui.updateParts([
          {
            id:    E.NEW_LINK_INPUT,
            style: { display: "flex", width: "100%", "font-size": "0.85em" },
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    });

    const newLinkInput = textInput({
      id:           E.NEW_LINK_INPUT,
      placeholder:  "EntityB: relationship description…",
      initialValue: "",
      storageKey:   `story:${E.NEW_LINK_KEY}`,
      style:        { display: "none", width: "100%", "font-size": "0.85em" },
      onSubmit: () => {
        void (async () => {
          const value = String((await api.v1.storyStorage.get(E.NEW_LINK_KEY)) || "").trim();
          const sep = value.indexOf(": ");
          const targetName  = sep > 0 ? value.slice(0, sep).trim()  : "";
          const description = sep > 0 ? value.slice(sep + 2).trim() : "";
          const targetEntity = targetName
            ? store.getState().world.entities.find(
                e => e.name.toLowerCase() === targetName.toLowerCase(),
              )
            : undefined;
          if (targetEntity && description) {
            store.dispatch(relationshipAdded({
              relationship: {
                id:           api.v1.uuid(),
                fromEntityId: entityId,
                toEntityId:   targetEntity.id,
                description,
              } satisfies Relationship,
            }));
          }
          await api.v1.storyStorage.remove(E.NEW_LINK_KEY);
          api.v1.ui.updateParts([
            {
              id:    E.NEW_LINK_INPUT,
              style: { display: "none", width: "100%", "font-size": "0.85em" },
            } as unknown as Partial<UIPart> & { id: string },
          ]);
        })();
      },
    });

    const linksSection = collapsibleSection({
      id:               E.LINKS_SECTION,
      title:            "Links",
      iconId:           "link" as IconId,
      initialCollapsed: true,
      storageKey:       `story:${E.LINKS_SECTION}`,
      style:            { "margin-top": "4px" },
      content: [
        column({
          style:   { gap: "4px" },
          content: [
            addLinkBtn,
            newLinkInput,
            column({ id: E.LINKS_LIST, style: { gap: "2px" }, content: initialLinkParts }),
          ],
        }),
      ],
    });

    const contentCol = column({
      id:    `${E.ROOT}-content`,
      style: { gap: "4px", padding: "0 2px 4px" },
      content: [
        await summaryText.build(),
        linksSection,
      ],
    });

    const contentBridge = new SuiRawPart(`${E.ROOT}-content-bridge`, contentCol);

    return new SuiCollapsible({
      id:               E.ROOT,
      header:           card,
      children:         [contentBridge],
      initialCollapsed: true,
      storageKey:       `${E.ROOT}.collapsed`,
      storageMode:      "story",
    }).build();
  }
}
