import { defineComponent } from "nai-act";
import { RootState, CrucibleNodeLink } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  NAI_HEADER,
} from "../../colors";

const { text, row, column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Map DULFS field IDs to display labels. */
const FIELD_LABELS: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
};

/** Group nodes by fieldId for display. */
function groupByField(nodes: CrucibleNodeLink[]): Map<DulfsFieldID, CrucibleNodeLink[]> {
  const groups = new Map<DulfsFieldID, CrucibleNodeLink[]>();
  for (const node of nodes) {
    const list = groups.get(node.fieldId) || [];
    list.push(node);
    groups.set(node.fieldId, list);
  }
  return groups;
}

export const BuilderView = defineComponent<undefined, RootState>({
  id: () => CR.BUILDER_ROOT,

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "6px",
    },
    sectionTitle: {
      "font-size": "0.75em",
      "font-weight": "bold",
      "text-transform": "uppercase",
      opacity: "0.6",
    },
    divider: {
      "border-top": "1px solid rgba(255,255,255,0.08)",
      margin: "4px 0",
    },
    nodeCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(129,212,250,0.4)",
      gap: "2px",
    },
    nodeName: {
      "font-size": "0.85em",
      "font-weight": "bold",
    },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;

    useSelector(
      (s) => ({
        nodes: s.crucible.builder.nodes,
        phase: s.crucible.phase,
      }),
      (slice) => {
        if (slice.nodes.length === 0 || (slice.phase !== "chaining" && slice.phase !== "building")) {
          api.v1.ui.updateParts([
            { id: CR.BUILDER_ROOT, style: this.style?.("hidden") },
          ]);
          return;
        }

        const groups = groupByField(slice.nodes);
        const sectionParts: UIPart[] = [
          row({ style: this.style?.("divider"), content: [] }),
          text({ text: "World Elements", style: { ...this.style?.("sectionTitle"), color: NAI_HEADER } }),
        ];

        for (const [fieldId, nodes] of groups) {
          const label = FIELD_LABELS[fieldId] || fieldId;
          sectionParts.push(
            text({ text: label, style: this.style?.("sectionTitle") }),
          );

          for (const node of nodes) {
            sectionParts.push(
              column({
                style: this.style?.("nodeCard"),
                content: [
                  text({ text: node.name, style: this.style?.("nodeName") }),
                ],
              }),
            );
          }
        }

        api.v1.ui.updateParts([
          { id: CR.BUILDER_ROOT, style: this.style?.("root"), content: sectionParts },
        ]);
      },
    );

    return column({
      id: CR.BUILDER_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
