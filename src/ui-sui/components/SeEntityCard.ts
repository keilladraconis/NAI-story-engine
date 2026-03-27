/**
 * SeEntityCard — SUI replacement for EntityCard.ts (draft lifecycle, Phase 3).
 *
 * Displays entity name (as collapsibleSection title) + editable name:summary
 * field with a discard button. Name changes update the section title reactively.
 *
 * Live lifecycle (reforge/regen/move/delete) will be added in Phase 4 when the
 * World tab is migrated. For now only "draft" is supported.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  entityEdited,
  entitySummaryUpdated,
  entityDiscardRequested,
} from "../../core/store/slices/world";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeEditableText } from "./SeEditableText";

type SeEntityCardTheme = { default: { self: { style: object } } };
type SeEntityCardState = Record<string, never>;

export type SeEntityCardOptions = {
  entityId:  string;
  lifecycle: "draft" | "live";
} & SuiComponentOptions<SeEntityCardTheme, SeEntityCardState>;

const CATEGORY_ICON: Record<string, IconId> = {
  "dramat-personae":     "user",
  "universe-systems":    "cpu",
  "locations":           "map-pin",
  "factions":            "shield",
  "situational-dynamics":"activity",
  "topics":              "hash",
};

export class SeEntityCard extends SuiComponent<
  SeEntityCardTheme,
  SeEntityCardState,
  SeEntityCardOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher:  StoreWatcher;
  private readonly _editable: SeEditableText;

  constructor(options: SeEntityCardOptions) {
    super(
      { state: {} as SeEntityCardState, ...options },
      { default: { self: { style: {} } } },
    );

    const { entityId, lifecycle } = options;
    const E = IDS.entity(entityId, lifecycle);

    const { button } = api.v1.ui.part;

    // Discard button lives in the editable's header row (extraControls = sync UIParts).
    const discardBtn = button({
      id:       E.DISCARD_BTN,
      iconId:   "trash" as IconId,
      callback: () => { store.dispatch(entityDiscardRequested({ entityId })); },
    });

    this._watcher = new StoreWatcher();

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
      extraControls: [discardBtn],
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
          // Propagate rename across other entity summaries
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
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const { entityId, lifecycle } = this.options;
    const E = IDS.entity(entityId, lifecycle);

    this._watcher.dispose();
    // Reactively update title when entity name changes
    this._watcher.watch(
      (s) => s.world.entities.find(e => e.id === entityId)?.name ?? "",
      (newName) => { api.v1.ui.updateParts([{ id: E.ROOT, title: newName } as unknown as Partial<UIPart> & { id: string }]); },
    );

    const entity   = store.getState().world.entities.find(e => e.id === entityId);
    const name     = entity?.name     ?? "";
    const iconId   = entity?.categoryId ? CATEGORY_ICON[entity.categoryId] : undefined;

    const summaryPart = await this._editable.build();

    const { collapsibleSection, column } = api.v1.ui.part;

    return collapsibleSection({
      id:               E.ROOT,
      title:            name,
      iconId,
      initialCollapsed: false,
      content: [
        column({ style: { gap: "4px" }, content: [summaryPart] }),
      ],
    });
  }
}
