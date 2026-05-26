/**
 * SeInlineEntityCard — compact draft-entity card rendered inline in a chat body.
 *
 * Shows category chip + name + truncated summary, with Edit / Cast / Discard
 * controls. Live-updates name/summary via StoreWatcher. ChatPanel filters cast
 * or discarded entities via `forgeSpec.inlineEntityIdsFor`, so this card does
 * not manage its own unmount.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import { SeConfirmButton } from "./SeConfirmButton";
import { SeEntityEditPane } from "./SeEntityEditPane";
import {
  entityCastRequested,
  entityDiscardRequested,
} from "../../core/store/effects/forge-chat-effects";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { FieldID } from "../../config/field-definitions";
import type { DulfsFieldID } from "../../config/field-definitions";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeInlineEntityCardOptions = {
  entityId: string;
  chatId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

const CATEGORY_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

export class SeInlineEntityCard extends SuiComponent<
  Theme,
  State,
  SeInlineEntityCardOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _discardBtn: SeConfirmButton;

  constructor(options: SeInlineEntityCardOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._discardBtn = new SeConfirmButton({
      id: `${options.id}-discard`,
      label: "Discard",
      confirmLabel: "Discard?",
      style: { "font-size": "0.75em", padding: "2px 8px" },
      onConfirm: async () => {
        store.dispatch(entityDiscardRequested({ entityId: options.entityId }));
      },
    });
  }

  async compose(): Promise<UIPartColumn> {
    this._watcher.dispose();
    const { entityId, editHost } = this.options;
    const { column, row, text, button } = api.v1.ui.part;
    const state = store.getState();
    const entity = state.world.entitiesById[entityId];
    if (!entity) return column({ id: this.id, content: [] });

    const nameId = `${this.id}-name`;
    const summaryId = `${this.id}-summary`;
    const chipText = CATEGORY_LABEL[entity.categoryId] ?? "Entity";

    this._watcher.watch(
      (s) => {
        const e = s.world.entitiesById[entityId];
        return {
          name: e?.name ?? "",
          summary: e?.summary ?? "",
          lifecycle: e?.lifecycle ?? "draft",
        };
      },
      ({ name, summary }) => {
        api.v1.ui.updateParts([
          { id: nameId, text: name } as unknown as Partial<UIPart> & {
            id: string;
          },
          { id: summaryId, text: truncate(summary, 200) } as unknown as Partial<UIPart> & {
            id: string;
          },
        ]);
      },
      (a, b) =>
        a.name === b.name &&
        a.summary === b.summary &&
        a.lifecycle === b.lifecycle,
    );

    const discardPart = await this._discardBtn.build();

    return column({
      id: this.id,
      style: {
        gap: "4px",
        padding: "8px",
        "margin-left": "12px",
        "border-left": "2px solid rgba(120,180,255,0.4)",
        "background-color": "rgba(120,180,255,0.06)",
      },
      content: [
        row({
          style: { gap: "6px", "align-items": "center" },
          content: [
            text({
              text: chipText,
              style: {
                "font-size": "0.7em",
                padding: "1px 6px",
                "border-radius": "3px",
                "background-color": "rgba(255,255,255,0.08)",
                opacity: "0.75",
              },
            }),
            text({
              id: nameId,
              text: entity.name,
              style: {
                "font-weight": "bold",
                "font-size": "0.85em",
                flex: "1",
              },
            }),
            button({
              id: `${this.id}-edit`,
              text: "Edit",
              style: { "font-size": "0.75em", padding: "2px 8px" },
              callback: () => {
                editHost.open(
                  new SeEntityEditPane({
                    id: `se-edit-${entityId}`,
                    entityId,
                    editHost,
                  }),
                );
              },
            }),
            button({
              id: `${this.id}-cast`,
              text: "Cast",
              style: { "font-size": "0.75em", padding: "2px 8px" },
              callback: () => {
                store.dispatch(entityCastRequested({ entityId }));
              },
            }),
            discardPart,
          ],
        }),
        text({
          id: summaryId,
          text: truncate(entity.summary, 200),
          style: { "font-size": "0.8em", opacity: "0.8" },
        }),
      ],
    });
  }
}
