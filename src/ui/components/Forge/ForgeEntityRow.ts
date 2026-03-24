import { defineComponent } from "nai-act";
import { RootState, Relationship } from "../../../core/store/types";
import { entityDiscardRequested, entityEdited, entitySummaryUpdated, relationshipAdded } from "../../../core/store/slices/world";
import { FieldID } from "../../../config/field-definitions";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { ForgeRelationshipItem } from "./ForgeRelationshipItem";

const { column, button, collapsibleSection, textInput } = api.v1.ui.part;

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

  styles: {
    linksSection: { "margin-top": "2px" },
  },

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

    // ── Outgoing links ──────────────────────────────────────────────────────

    const linksList = column({
      id: E.LINKS_LIST,
      style: { gap: "2px" },
      content: ctx.bindList(
        E.LINKS_LIST,
        (s) => s.world.relationships.filter((r) => r.fromEntityId === props.entityId || r.toEntityId === props.entityId),
        (r: Relationship) => r.id,
        (r: Relationship) => ({
          component: ForgeRelationshipItem,
          props: { entityId: props.entityId, relationshipId: r.id },
        }),
      ),
    });

    // ── Add-link button + inline input ────────────────────────────────────
    const addLinkBtn = button({
      id: E.ADD_LINK_BTN,
      text: "+ Link",
      style: { "font-size": "0.8em", "align-self": "flex-start" },
      callback: () => {
        api.v1.ui.updateParts([
          { id: E.NEW_LINK_INPUT, style: { display: "flex", width: "100%", "font-size": "0.85em" } },
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
        (async () => {
          const value = String((await api.v1.storyStorage.get(E.NEW_LINK_KEY)) || "").trim();
          const sep = value.indexOf(": ");
          const targetName = sep > 0 ? value.slice(0, sep).trim() : "";
          const description = sep > 0 ? value.slice(sep + 2).trim() : "";
          const targetEntity = targetName
            ? ctx.getState().world.entities.find(
                (e) => e.name.toLowerCase() === targetName.toLowerCase(),
              )
            : undefined;

          if (targetEntity && description) {
            dispatch(relationshipAdded({
              relationship: {
                id: api.v1.uuid(),
                fromEntityId: props.entityId,
                toEntityId: targetEntity.id,
                description,
              } satisfies Relationship,
            }));
          }
          // Always clear and hide — silent rejection on bad format or unknown entity
          await api.v1.storyStorage.remove(E.NEW_LINK_KEY);
          api.v1.ui.updateParts([
            { id: E.NEW_LINK_INPUT, style: { display: "none", width: "100%", "font-size": "0.85em" } },
          ]);
        })();
      },
    });

    const linksSection = collapsibleSection({
      id: E.LINKS_SECTION,
      title: "Links",
      iconId: "link",
      initialCollapsed: true,
      storageKey: `story:${E.LINKS_SECTION}`,
      style: this.style?.("linksSection"),
      content: [
        column({
          style: { gap: "4px" },
          content: [addLinkBtn, newLinkInput, linksList],
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
          content: [summaryEditable, linksSection],
        }),
      ],
    });
  },
});
