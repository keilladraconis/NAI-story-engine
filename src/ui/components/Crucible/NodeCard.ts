import { defineComponent } from "nai-act";
import { RootState, CrucibleNode, CrucibleNodeKind } from "../../../core/store/types";
import {
  nodeFavorited,
  nodeEdited,
  nodeDisfavored,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { calculateTextAreaHeight } from "../../utils";

export interface NodeCardProps {
  node: CrucibleNode;
  startInEditMode?: boolean;
}

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

const KIND_COLORS: Record<CrucibleNodeKind, string> = {
  goal: "#f5f3c2",
  character: "#81d4fa",
  faction: "#ef5350",
  location: "#66bb6a",
  system: "#ab47bc",
  situation: "#ffa726",
  beat: "#78909c",
  opener: "#fff176",
};

/**
 * Extract the display name from DULFS-formatted content.
 * Handles "Name (Gender, Age, Role): desc" and "Name: desc".
 */
function extractName(content: string): string {
  // "Name (Gender, Age, Role): desc" → "Name"
  const parenMatch = content.match(/^([^(:]+)\s*\(/);
  if (parenMatch) return parenMatch[1].trim();
  // "Name: desc" → "Name"
  const colonIdx = content.indexOf(":");
  if (colonIdx > 0 && colonIdx < 60) return content.slice(0, colonIdx).trim();
  return content.slice(0, 30).trim();
}

export const NodeCard = defineComponent<NodeCardProps, RootState>({
  id: (props) => IDS.CRUCIBLE.node(props.node.id).ROOT,

  styles: {
    cardRoot: {
      padding: "4px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "3px solid rgba(255,255,255,0.15)",
      gap: "2px",
      width: "220px",
      "min-width": "180px",
      "max-width": "260px",
      flex: "1 1 220px",
    },
    cardFavorited: {
      "border-left": "3px solid rgba(233,30,99,0.7)",
    },
    cardEdited: {
      "border-left": "3px solid rgba(33,150,243,0.7)",
    },
    cardDisfavored: {
      opacity: "0.4",
      "border-left": "3px dashed rgba(244,67,54,0.5)",
    },
    headerRow: {
      "align-items": "center",
      gap: "4px",
    },
    kindBadge: {
      "font-size": "0.65em",
      opacity: "0.9",
      "text-transform": "uppercase",
      "letter-spacing": "0.5px",
    },
    staleBadge: {
      "font-size": "0.75em",
      color: "#ff9800",
    },
    staleBadgeHidden: {
      display: "none",
    },
    contentText: {
      "font-size": "0.8em",
      opacity: "0.85",
      "word-break": "break-word",
    },
    connectionsRow: {
      "font-size": "0.7em",
      opacity: "0.6",
      "flex-wrap": "wrap",
      gap: "4px",
    },
    connectionsHidden: {
      display: "none",
    },
    actionBtn: {
      padding: "1px 5px",
      "font-size": "0.75em",
    },
    spacer: { flex: "1" },
    viewContainer: { width: "100%" },
    editContainer: { width: "100%", display: "none" },
    editContainerVisible: { width: "100%", display: "block" },
    visible: { display: "block" },
    hidden: { display: "none" },
    inputStyle: { width: "100%", "min-height": "60px" },
    saveRow: { "justify-content": "flex-end", "margin-top": "2px", gap: "4px" },
    saveBtn: { padding: "3px 8px", "font-size": "0.8em" },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { node, startInEditMode } = props;
    const ids = IDS.CRUCIBLE.node(node.id);

    const favoriteNode = () =>
      dispatch(nodeFavorited({ id: node.id }));
    const disfavorNode = () =>
      dispatch(nodeDisfavored({ id: node.id }));

    const enterEdit = () => {
      const currentNode = ctx.getState().crucible.nodes.find((n) => n.id === node.id);
      const content = currentNode?.content || node.content;
      api.v1.storyStorage.set(`cr-draft-content-${node.id}`, content);
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "hidden") },
        { id: ids.EDIT, style: this.style?.("editContainerVisible") },
      ]);
    };

    const cancelEdit = () => {
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "visible") },
        { id: ids.EDIT, style: this.style?.("editContainer") },
      ]);
    };

    const saveEdit = async () => {
      const content = String(
        (await api.v1.storyStorage.get(`cr-draft-content-${node.id}`)) || "",
      );
      if (content.trim()) {
        dispatch(nodeEdited({ id: node.id, content }));
      }
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "visible") },
        { id: ids.EDIT, style: this.style?.("editContainer") },
      ]);
    };

    // Build connection tags from edges
    const buildConnectionText = (state: RootState): string => {
      const edges = state.crucible.edges.filter(
        (e) => e.source === node.id || e.target === node.id,
      );
      if (edges.length === 0) return "";

      const parts: string[] = [];
      for (const edge of edges) {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const otherNode = state.crucible.nodes.find((n) => n.id === otherId);
        if (!otherNode) continue;
        const name = extractName(otherNode.content);
        const direction = edge.source === node.id ? "\u2192" : "\u2190";
        parts.push(`${direction} ${edge.type}: ${name}`);
      }
      return parts.join(" | ");
    };

    // Reactive: update node display when state changes
    useSelector(
      (state) => ({
        node: state.crucible.nodes.find((n) => n.id === node.id),
        edges: state.crucible.edges.filter(
          (e) => e.source === node.id || e.target === node.id,
        ),
      }),
      (slice) => {
        const current = slice.node;
        if (!current) return;

        api.v1.ui.updateParts([
          { id: ids.CONTENT, text: current.content },
        ]);

        // Update stale badge
        api.v1.ui.updateParts([
          {
            id: ids.STALE,
            style: current.stale
              ? this.style?.("staleBadge")
              : this.style?.("staleBadgeHidden"),
          },
        ]);

        // Update card border based on status
        let borderStyle: string;
        switch (current.status) {
          case "favorited":
            borderStyle = "cardFavorited";
            break;
          case "edited":
            borderStyle = "cardEdited";
            break;
          case "disfavored":
            borderStyle = "cardDisfavored";
            break;
          default:
            borderStyle = "cardRoot";
        }
        api.v1.ui.updateParts([
          { id: ids.ROOT, style: this.style?.("cardRoot", borderStyle) },
        ]);

        // Update connection tags
        const state = ctx.getState();
        const connText = buildConnectionText(state);
        api.v1.ui.updateParts([
          {
            id: ids.CONNECTIONS,
            text: connText,
            style: connText
              ? this.style?.("connectionsRow")
              : this.style?.("connectionsHidden"),
          },
        ]);
      },
    );

    const initialBorderStyle =
      node.status === "favorited"
        ? "cardFavorited"
        : node.status === "edited"
          ? "cardEdited"
          : node.status === "disfavored"
            ? "cardDisfavored"
            : "cardRoot";

    // If starting in edit mode, seed storage for the empty content
    if (startInEditMode) {
      api.v1.storyStorage.set(`cr-draft-content-${node.id}`, node.content);
    }

    // Initial connection text
    const initialState = ctx.getState();
    const initialConnText = buildConnectionText(initialState);
    const kindColor = KIND_COLORS[node.kind] || "#ffffff";

    // -- View Mode --
    const viewContainer = column({
      id: ids.VIEW,
      style: this.style?.(
        "viewContainer",
        startInEditMode ? "hidden" : undefined,
      ),
      content: [
        row({
          style: this.style?.("headerRow"),
          content: [
            text({
              text: node.kind,
              style: {
                ...this.style?.("kindBadge"),
                color: kindColor,
              },
            }),
            text({
              id: ids.STALE,
              text: "\u26A0",
              style: node.stale
                ? this.style?.("staleBadge")
                : this.style?.("staleBadgeHidden"),
            }),
            text({ text: "", style: this.style?.("spacer") }),
            button({
              text: "\u2764",
              style: this.style?.("actionBtn"),
              callback: favoriteNode,
              id: `${ids.ROOT}-fav`,
            }),
            button({
              text: "\u270E",
              style: this.style?.("actionBtn"),
              callback: enterEdit,
              id: `${ids.ROOT}-edit`,
            }),
            button({
              text: "\u2717",
              style: this.style?.("actionBtn"),
              callback: disfavorNode,
              id: `${ids.ROOT}-disfavor`,
            }),
          ],
        }),
        text({
          id: ids.CONTENT,
          text: node.content,
          style: this.style?.("contentText"),
          markdown: true,
        }),
        text({
          id: ids.CONNECTIONS,
          text: initialConnText,
          style: initialConnText
            ? this.style?.("connectionsRow")
            : this.style?.("connectionsHidden"),
        }),
      ],
    });

    // -- Edit Mode --
    const editContainer = column({
      id: ids.EDIT,
      style: startInEditMode
        ? this.style?.("editContainerVisible")
        : this.style?.("editContainer"),
      content: [
        multilineTextInput({
          id: ids.CONTENT_INPUT,
          storageKey: `story:cr-draft-content-${node.id}`,
          style: {
            ...this.style?.("inputStyle"),
            height: calculateTextAreaHeight(node.content || ""),
          },
          initialValue: node.content,
        }),
        row({
          style: this.style?.("saveRow"),
          content: [
            button({
              id: ids.CANCEL_BTN,
              text: "Cancel",
              style: this.style?.("saveBtn"),
              callback: cancelEdit,
            }),
            button({
              id: ids.SAVE_BTN,
              text: "Save",
              iconId: "save",
              style: this.style?.("saveBtn"),
              callback: saveEdit,
            }),
          ],
        }),
      ],
    });

    return column({
      id: ids.ROOT,
      style: this.style?.("cardRoot", initialBorderStyle),
      content: [viewContainer, editContainer],
    });
  },
});
