/**
 * SeEntityCard — SUI replacement for EntityCard.ts.
 *
 * Supports both "draft" and "live" lifecycle.
 *
 * Draft: editable name:summary + discard button in header extraControls.
 * Live:  editable name:summary + action row (reforge, regen icon, move, delete)
 *        + links collapsibleSection (reactive list via StoreWatcher).
 *
 * Name changes update the collapsibleSection title reactively.
 * Rename propagates across other entity summaries.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
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
import { SeEditableText } from "./SeEditableText";
import { SeGenerationIconButton } from "./SeGenerationButton";
import { openMoveModal } from "./MoveModal";
import { buildSeRelationshipItem } from "./SeRelationshipItem";

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId:  string;
  lifecycle: "draft" | "live";
} & SuiComponentOptions<SeEntityCardTheme, SeEntityCardState>;

const CATEGORY_ICON: Record<string, IconId> = {
  "dramat-personae":      "user",
  "universe-systems":     "cpu",
  "locations":            "map-pin",
  "factions":             "shield",
  "situational-dynamics": "activity",
  "topics":               "hash",
};

export class SeEntityCard extends SuiComponent<
  SeEntityCardTheme,
  SeEntityCardState,
  SeEntityCardOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher:  StoreWatcher;
  private readonly _editable: SeEditableText;
  private readonly _regenBtn: SeGenerationIconButton | null;

  constructor(options: SeEntityCardOptions) {
    super(
      { state: {} as SeEntityCardState, ...options },
      { default: { self: { style: {} } } },
    );

    const { entityId, lifecycle } = options;
    const E = IDS.entity(entityId, lifecycle);
    const { button } = api.v1.ui.part;

    this._watcher = new StoreWatcher();

    // ── Draft-only discard button (sync, safe in constructor) ──────────────
    const draftExtraControls: UIPart[] = lifecycle === "draft"
      ? [button({
          id:       E.DISCARD_BTN,
          iconId:   "trash" as IconId,
          callback: () => { store.dispatch(entityDiscardRequested({ entityId })); },
        })]
      : [];

    const parseNameSummary = (content: string): { name: string; summary: string } | null => {
      const sep = content.indexOf(": ");
      if (sep === -1) return null;
      const parsedName = content.slice(0, sep).trim();
      if (!parsedName || parsedName.length > 64) return null;
      return { name: parsedName, summary: content.slice(sep + 2).trim() };
    };

    this._editable = new SeEditableText({
      id:            `${E.ROOT}-summary`,
      placeholder:   "Name: Summary…",
      extraControls: draftExtraControls,
      getContent: () => {
        const e = store.getState().world.entities.find(en => en.id === entityId);
        return e ? `${e.name}: ${e.summary}` : "";
      },
      formatDisplay: (content: string) => {
        const parsed = parseNameSummary(content);
        return parsed ? parsed.summary : content.trim();
      },
      liveSelector: (s) => {
        const e = s.world.entities.find(en => en.id === entityId);
        return e ? `${e.name}: ${e.summary}` : "";
      },
      onSave: (content: string) => {
        const parsed = parseNameSummary(content);
        if (parsed) {
          const oldName = store.getState().world.entities.find(e => e.id === entityId)?.name ?? "";
          store.dispatch(entityEdited({ entityId, name: parsed.name, summary: parsed.summary }));
          if (oldName && oldName !== parsed.name) {
            const pattern = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
            for (const entity of store.getState().world.entities) {
              if (entity.id === entityId) continue;
              const updated = entity.summary.replace(pattern, parsed.name);
              if (updated !== entity.summary) {
                store.dispatch(entitySummaryUpdated({ entityId: entity.id, summary: updated }));
              }
            }
          }
        } else {
          store.dispatch(entitySummaryUpdated({ entityId, summary: content.trim() }));
        }
      },
    });

    // ── Live-only regen icon button (async build in compose) ───────────────
    if (lifecycle === "live") {
      this._regenBtn = new SeGenerationIconButton({
        id:       E.REGEN_BTN,
        iconId:   "zap" as IconId,
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

  async compose(): Promise<UIPartCollapsibleSection> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);

    this._watcher.dispose();

    // Reactively update section title when entity name changes
    this._watcher.watch(
      (s) => s.world.entities.find(e => e.id === entityId)?.name ?? "",
      (newName) => {
        api.v1.ui.updateParts([
          { id: E.ROOT, title: newName } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const entity = store.getState().world.entities.find(e => e.id === entityId);
    const name   = entity?.name ?? "";
    const iconId = entity?.categoryId ? CATEGORY_ICON[entity.categoryId] : undefined;

    const summaryPart = await this._editable.build();
    const { collapsibleSection, column, row, button, textInput } = api.v1.ui.part;

    // ── Draft layout ───────────────────────────────────────────────────────
    if (lifecycle === "draft") {
      return collapsibleSection({
        id:               E.ROOT,
        title:            name,
        iconId,
        initialCollapsed: false,
        content: [column({ style: { gap: "4px" }, content: [summaryPart] })],
      });
    }

    // ── Live layout ────────────────────────────────────────────────────────

    // Rebuild links list when relationship IDs change
    this._watcher.watch(
      (s) => s.world.relationships
        .filter(r => r.fromEntityId === entityId || r.toEntityId === entityId)
        .map(r => r.id),
      () => { void this._rebuildLinksList(); },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    const regenPart = await this._regenBtn!.build();

    const actionRow = row({
      style: { gap: "4px", "justify-content": "flex-end", "margin-top": "2px" },
      content: [
        button({
          id:       E.REFORGE_BTN,
          iconId:   "rotate-ccw" as IconId,
          callback: () => { store.dispatch(entityReforgeRequested({ entityId })); },
        }),
        regenPart,
        button({
          id:       E.MOVE_BTN,
          iconId:   "log-out" as IconId,
          callback: () => {
            void openMoveModal(entityId, { getState: store.getState, dispatch: store.dispatch });
          },
        }),
        button({
          id:       E.DELETE_BTN,
          iconId:   "trash" as IconId,
          callback: () => { store.dispatch(entityDeleted({ entityId })); },
        }),
      ],
    });

    // Initial links list
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
      style:            { "margin-top": "2px" },
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

    return collapsibleSection({
      id:               E.ROOT,
      title:            name,
      iconId,
      initialCollapsed: false,
      content: [
        column({
          style:   { gap: "4px" },
          content: [summaryPart, actionRow, linksSection],
        }),
      ],
    });
  }
}
