/**
 * buildSeRelationshipItem — creates and builds a SeEditableText for one relationship.
 *
 * Displays "OtherName: description". onSave handles target-entity redirect
 * (when user changes the other entity name) and description-only updates.
 * A delete button sits in the editable's extraControls.
 *
 * Returns a UIPart (the built SeEditableText part). Factory function rather than
 * SuiComponent because relationship items are created fresh on each links-list rebuild.
 */

import { store } from "../../core/store";
import {
  relationshipRemoved,
  relationshipUpdated,
  relationshipAdded,
} from "../../core/store/slices/world";
import type { Relationship } from "../../core/store/types";
import { IDS } from "../../ui/framework/ids";
import { SeEditableText } from "./SeEditableText";

export async function buildSeRelationshipItem(
  entityId:       string,
  relationshipId: string,
  lifecycle:      "draft" | "live",
): Promise<UIPart> {
  const R = IDS.entity(entityId, lifecycle).rel(relationshipId);
  const { button } = api.v1.ui.part;

  const deleteBtn = button({
    id:       R.DELETE_BTN,
    iconId:   "trash" as IconId,
    callback: () => { store.dispatch(relationshipRemoved({ relationshipId })); },
  });

  const state = store.getState();
  const rel = state.world.relationships.find(r => r.id === relationshipId);
  const isFromInit = rel?.fromEntityId === entityId;
  const otherIdInit = isFromInit ? rel?.toEntityId : rel?.fromEntityId;
  const otherNameInit = state.world.entities.find(e => e.id === otherIdInit)?.name ?? "?";
  const initialDisplay = `${otherNameInit}: ${rel?.description ?? ""}`;

  const parseOtherDescription = (content: string): { otherName: string; description: string } | null => {
    const sep = content.indexOf(": ");
    if (sep === -1) return null;
    const name = content.slice(0, sep).trim();
    if (!name || name.length > 64) return null;
    return { otherName: name, description: content.slice(sep + 2).trim() };
  };

  const editable = new SeEditableText({
    id:            R.ROOT,
    placeholder:   "OtherEntity: relationship description…",
    initialDisplay,
    extraControls: [deleteBtn],

    getContent: () => {
      const r = store.getState().world.relationships.find(r => r.id === relationshipId);
      if (!r) return initialDisplay;
      const sid = r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId;
      const other = store.getState().world.entities.find(e => e.id === sid);
      return other ? `${other.name}: ${r.description}` : r.description;
    },

    liveSelector: (s) => {
      const r = s.world.relationships.find(r => r.id === relationshipId);
      if (!r) return "";
      const sid = r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId;
      const other = s.world.entities.find(e => e.id === sid);
      return other ? `${other.name}: ${r.description}` : r.description;
    },

    onSave: (content: string) => {
      const parsed = parseOtherDescription(content);
      if (!parsed) {
        store.dispatch(relationshipUpdated({ relationshipId, description: content.trim() }));
        return;
      }

      const currentRel = store.getState().world.relationships.find(r => r.id === relationshipId);
      if (!currentRel) return;
      const isFrom = currentRel.fromEntityId === entityId;
      const currentOtherId = isFrom ? currentRel.toEntityId : currentRel.fromEntityId;
      const currentOther = store.getState().world.entities.find(e => e.id === currentOtherId);

      if (parsed.otherName.toLowerCase() !== currentOther?.name.toLowerCase()) {
        const newOther = store.getState().world.entities.find(
          e => e.name.toLowerCase() === parsed.otherName.toLowerCase(),
        );
        if (!newOther) return;
        store.dispatch(relationshipRemoved({ relationshipId }));
        store.dispatch(relationshipAdded({
          relationship: {
            id:           api.v1.uuid(),
            fromEntityId: isFrom ? entityId : newOther.id,
            toEntityId:   isFrom ? newOther.id : entityId,
            description:  parsed.description,
          } satisfies Relationship,
        }));
      } else {
        store.dispatch(relationshipUpdated({ relationshipId, description: parsed.description }));
      }
    },
  });

  return editable.build();
}
