import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { entityDiscardRequested, entityEdited, entitySummaryUpdated } from "../../../core/store/slices/world";
import { FieldID } from "../../../config/field-definitions";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";

const { column, button, collapsibleSection } = api.v1.ui.part;

const CATEGORY_ICON: Record<string, IconId> = {
  [FieldID.DramatisPersonae]: "user",
  [FieldID.UniverseSystems]: "cpu",
  [FieldID.Locations]: "map-pin",
  [FieldID.Factions]: "shield",
  [FieldID.SituationalDynamics]: "activity",
  [FieldID.Topics]: "hash",
};

export interface ForgeEntityRowProps {
  entityId: string;
}

export const ForgeEntityRow = defineComponent<ForgeEntityRowProps, RootState>({
  id: (props) => IDS.FORGE.entity(props.entityId).ROOT,

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const E = IDS.FORGE.entity(props.entityId);
    const entity = ctx.getState().world.entities.find((e) => e.id === props.entityId);

    const name = entity?.name ?? "";
    const summary = entity?.summary ?? "";
    const iconId = entity?.categoryId ? CATEGORY_ICON[entity.categoryId] : undefined;

    // Reactively update collapsibleSection title when entity name changes
    useSelector(
      (s) => s.world.entities.find((e) => e.id === props.entityId)?.name ?? "",
      (newName) => { api.v1.ui.updateParts([{ id: E.ROOT, title: newName }]); },
    );

    // Editor shows "Name: Summary"; save parses back to name + summary
    const getContent = () => {
      const e = ctx.getState().world.entities.find((en) => en.id === props.entityId);
      return e ? `${e.name}: ${e.summary}` : `${name}: ${summary}`;
    };

    const onSave = (content: string) => {
      const parsed = parseNameSummary(content);
      if (parsed) {
        dispatch(entityEdited({ entityId: props.entityId, name: parsed.name, summary: parsed.summary }));
      } else {
        dispatch(entitySummaryUpdated({ entityId: props.entityId, summary: content.trim() }));
      }
    };

    const parseNameSummary = (content: string): { name: string; summary: string } | null => {
      const sep = content.indexOf(": ");
      if (sep === -1) return null;
      const name = content.slice(0, sep).trim();
      if (!name || name.length > 64) return null;
      return { name, summary: content.slice(sep + 2).trim() };
    };

    const formatDisplay = (content: string) => {
      const parsed = parseNameSummary(content);
      return parsed ? parsed.summary : content.trim();
    };

    const { part: summaryEditable } = ctx.render(EditableText, {
      id: `${E.ROOT}-summary`,
      getContent,
      onSave,
      formatDisplay,
      initialDisplay: summary,
      placeholder: "Name: Summary…",
      extraControls: [
        button({
          id: E.DISCARD_BTN,
          iconId: "trash",
          callback: () => dispatch(entityDiscardRequested({ entityId: props.entityId })),
        }),
      ],
    });

    return collapsibleSection({
      id: E.ROOT,
      title: name,
      iconId,
      initialCollapsed: false,
      content: [
        column({
          id: E.ACTION_BAR,
          style: { gap: "6px" },
          content: [summaryEditable],
        }),
      ],
    });
  },
});
