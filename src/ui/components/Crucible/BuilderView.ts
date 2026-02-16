import { defineComponent } from "nai-act";
import { RootState, CrucibleNodeLink } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  builderNodeUpdated,
  builderNodeRemoved,
} from "../../../core/store/slices/crucible";
import { EditableText } from "../EditableText";
import {
  NAI_HEADER,
} from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

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

/** Format node as "Name: content" for the editable text field. */
function formatNodeText(node: CrucibleNodeLink): string {
  return node.content ? `${node.name}: ${node.content}` : node.name;
}

/** Escape text for markdown view display. */
function escapeViewText(raw: string): string {
  return raw.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._";
}

/** Parse "Name: content" back into name and content parts. */
function parseNodeText(raw: string): { name: string; content: string } {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { name: raw.trim(), content: "" };
  return {
    name: raw.slice(0, colonIdx).trim(),
    content: raw.slice(colonIdx + 1).trim(),
  };
}

/** Storage key for a node's editable text. */
function nodeStorageKey(nodeId: string): string {
  return `cr-node-${nodeId}`;
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
    deleteBtn: {
      padding: "2px 6px",
      "font-size": "0.7em",
      opacity: "0.6",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    // Mount-once cache: nodeId → full card UIPart (including EditableText)
    const nodeCardCache = new Map<string, UIPart>();

    /** Ensure a node card exists in the cache, mounting EditableText once.
     *  Caller must seed storyStorage BEFORE calling this. */
    const ensureNodeCard = (node: CrucibleNodeLink): UIPart => {
      if (!nodeCardCache.has(node.id)) {
        const storageKey = nodeStorageKey(node.id);

        const { part: editable } = ctx.render(EditableText, {
          id: `cr-node-${node.id}-text`,
          storageKey,
          placeholder: "Name: description...",
          initialDisplay: formatNodeText(node),
          onSave: (raw: string) => {
            const parsed = parseNodeText(raw);
            dispatch(builderNodeUpdated({
              id: node.id,
              name: parsed.name,
              content: parsed.content,
            }));
          },
          label: node.name,
          extraControls: [
            button({
              text: "Delete",
              style: this.style?.("deleteBtn"),
              callback: () => {
                dispatch(builderNodeRemoved({ id: node.id }));
                api.v1.storyStorage.set(storageKey, "");
              },
            }),
          ],
        });

        nodeCardCache.set(node.id, column({
          id: `cr-node-card-${node.id}`,
          style: this.style?.("nodeCard"),
          content: [editable],
        }));
      }
      return nodeCardCache.get(node.id)!;
    };

    /** Build the grouped section UIParts from current nodes. */
    const buildSections = (nodes: CrucibleNodeLink[]): UIPart[] => {
      const groups = groupByField(nodes);
      const sectionParts: UIPart[] = [
        row({ style: this.style?.("divider"), content: [] }),
        text({ text: "World Elements", style: { ...this.style?.("sectionTitle"), color: NAI_HEADER } }),
      ];

      for (const [fieldId, fieldNodes] of groups) {
        const label = FIELD_LABELS[fieldId] || fieldId;
        sectionParts.push(
          text({ text: label, style: this.style?.("sectionTitle") }),
        );
        for (const node of fieldNodes) {
          sectionParts.push(ensureNodeCard(node));
        }
      }
      return sectionParts;
    };

    useSelector(
      (s) => s.crucible.builder.nodes,
      (nodes) => {
        // Evict removed nodes from cache
        const currentIds = new Set(nodes.map((n) => n.id));
        for (const [id] of nodeCardCache) {
          if (!currentIds.has(id)) {
            nodeCardCache.delete(id);
          }
        }

        if (nodes.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.BUILDER_ROOT, style: this.style?.("hidden"), content: [] },
          ]);
          return;
        }

        // Seed storyStorage for all nodes BEFORE building sections
        for (const node of nodes) {
          api.v1.storyStorage.set(nodeStorageKey(node.id), formatNodeText(node));
        }

        // Build section tree (ensureNodeCard mounts new EditableTexts once, reuses after)
        const sectionParts = buildSections(nodes);

        // Place tree — all view IDs now exist after this call
        api.v1.ui.updateParts([
          { id: CR.BUILDER_ROOT, style: this.style?.("root"), content: sectionParts },
        ]);

        // NOW update view text — view IDs are in the tree
        for (const node of nodes) {
          const viewText = escapeViewText(formatNodeText(node));
          api.v1.ui.updateParts([
            { id: `cr-node-${node.id}-text-view`, text: viewText },
          ]);
        }

        // Update labels for existing nodes (name may have been revised by builder)
        for (const node of nodes) {
          api.v1.ui.updateParts([
            { id: `cr-node-${node.id}-text-edit-btn`, text: "Edit" },
          ]);
        }
      },
    );

    // Always start hidden — useSelector handles all rendering on state changes
    // (persist/loaded / builderNodeAdded trigger the callback above)
    return column({
      id: CR.BUILDER_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
