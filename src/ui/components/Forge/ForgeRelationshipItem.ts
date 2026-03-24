import { defineComponent } from "nai-act";
import { RootState, Relationship } from "../../../core/store/types";
import {
  relationshipRemoved,
  relationshipUpdated,
  relationshipAdded,
} from "../../../core/store/slices/world";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";

const { button } = api.v1.ui.part;

export interface ForgeRelationshipItemProps {
  entityId: string;      // the entity whose Links section hosts this row
  relationshipId: string;
}

export const ForgeRelationshipItem = defineComponent<ForgeRelationshipItemProps, RootState>({
  id: (props) => IDS.FORGE.entity(props.entityId).rel(props.relationshipId).ROOT,

  build(props, ctx) {
    const { dispatch } = ctx;
    const R = IDS.FORGE.entity(props.entityId).rel(props.relationshipId);
    const state = ctx.getState();

    const rel = state.world.relationships.find((r) => r.id === props.relationshipId);
    // Determine which side the hosting entity is on
    const isFrom = rel?.fromEntityId === props.entityId;
    const otherEntityId = isFrom ? rel?.toEntityId : rel?.fromEntityId;
    const otherEntity = state.world.entities.find((e) => e.id === otherEntityId);
    const otherName = otherEntity?.name ?? "?";
    const description = rel?.description ?? "";
    const initialDisplay = `${otherName}: ${description}`;

    const parseOtherDescription = (content: string): { otherName: string; description: string } | null => {
      const sep = content.indexOf(": ");
      if (sep === -1) return null;
      const name = content.slice(0, sep).trim();
      if (!name || name.length > 64) return null;
      return { otherName: name, description: content.slice(sep + 2).trim() };
    };

    const getContent = (): string => {
      const r = ctx.getState().world.relationships.find((r) => r.id === props.relationshipId);
      const isFrom = r?.fromEntityId === props.entityId;
      const otherId = isFrom ? r?.toEntityId : r?.fromEntityId;
      const other = ctx.getState().world.entities.find((e) => e.id === otherId);
      return r && other ? `${other.name}: ${r.description}` : initialDisplay;
    };

    const onSave = (content: string): void => {
      const parsed = parseOtherDescription(content);
      if (!parsed) {
        dispatch(relationshipUpdated({ relationshipId: props.relationshipId, description: content.trim() }));
        return;
      }

      const currentRel = ctx.getState().world.relationships.find((r) => r.id === props.relationshipId);
      if (!currentRel) return;

      const isFrom = currentRel.fromEntityId === props.entityId;
      const currentOtherId = isFrom ? currentRel.toEntityId : currentRel.fromEntityId;
      const currentOther = ctx.getState().world.entities.find((e) => e.id === currentOtherId);

      if (parsed.otherName.toLowerCase() !== currentOther?.name.toLowerCase()) {
        // Other-side entity changed — retarget while preserving direction from this entity's perspective
        const newOther = ctx.getState().world.entities.find(
          (e) => e.name.toLowerCase() === parsed.otherName.toLowerCase(),
        );
        if (!newOther) return;
        dispatch(relationshipRemoved({ relationshipId: props.relationshipId }));
        dispatch(relationshipAdded({
          relationship: {
            id: api.v1.uuid(),
            fromEntityId: isFrom ? props.entityId : newOther.id,
            toEntityId: isFrom ? newOther.id : props.entityId,
            description: parsed.description,
          } satisfies Relationship,
        }));
      } else {
        dispatch(relationshipUpdated({ relationshipId: props.relationshipId, description: parsed.description }));
      }
    };

    const { part } = ctx.render(EditableText, {
      id: R.ROOT,
      getContent,
      onSave,
      initialDisplay,
      placeholder: "OtherEntity: relationship description…",
      extraControls: [
        button({
          id: R.DELETE_BTN,
          iconId: "trash",
          callback: () => dispatch(relationshipRemoved({ relationshipId: props.relationshipId })),
        }),
      ],
    });

    return part;
  },
});
