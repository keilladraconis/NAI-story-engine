import { defineComponent } from "nai-act";
import { RootState, CrucibleNodeLink } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID, FIELD_CONFIGS } from "../../../config/field-definitions";
import { ListItem, contentMinHeight, inputStyle } from "../Fields/ListItem";
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
  },

  build(_props, ctx) {
    const { useSelector } = ctx;

    // Cache rendered ListItem components by itemId
    const itemCache = new Map<string, { part: UIPart; unmount: () => void }>();

    const ensureItem = (node: CrucibleNodeLink): UIPart => {
      if (!itemCache.has(node.itemId)) {
        const config = FIELD_CONFIGS.find((c) => c.id === node.fieldId);
        if (!config) return text({ text: node.name });
        const rendered = ctx.render(ListItem, {
          config,
          item: { id: node.itemId, fieldId: node.fieldId },
        });
        itemCache.set(node.itemId, rendered);
      }
      return itemCache.get(node.itemId)!.part;
    };

    /** Resize textareas to match their content after a re-render. */
    const resizeItems = async (nodes: CrucibleNodeLink[]): Promise<void> => {
      for (const node of nodes) {
        const content = String(
          (await api.v1.storyStorage.get(`dulfs-item-${node.itemId}`)) || "",
        );
        if (content) {
          const inputId = `content-input-${node.itemId}`;
          api.v1.ui.updateParts([
            { id: inputId, style: inputStyle(contentMinHeight(content)) },
          ]);
        }
      }
    };

    useSelector(
      (s) => ({
        nodes: s.crucible.builder.nodes,
      }),
      async (slice) => {
        if (slice.nodes.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.BUILDER_ROOT, style: this.style?.("hidden") },
          ]);
          return;
        }

        // Clean up removed items
        const currentIds = new Set(slice.nodes.map((n) => n.itemId));
        for (const [id, cached] of itemCache) {
          if (!currentIds.has(id)) {
            cached.unmount();
            itemCache.delete(id);
          }
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
            sectionParts.push(ensureItem(node));
          }
        }

        api.v1.ui.updateParts([
          { id: CR.BUILDER_ROOT, style: this.style?.("root"), content: sectionParts },
        ]);

        await resizeItems(slice.nodes);
      },
    );

    return column({
      id: CR.BUILDER_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
