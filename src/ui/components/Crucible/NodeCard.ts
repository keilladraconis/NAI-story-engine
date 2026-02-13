import { defineComponent } from "nai-act";
import { RootState, CrucibleNode, CrucibleNodeStatus } from "../../../core/store/types";
import { nodeStatusChanged, nodeEdited } from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { calculateTextAreaHeight } from "../../utils";

export interface NodeCardProps {
  node: CrucibleNode;
}

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

const STATUS_COLORS: Record<CrucibleNodeStatus, string> = {
  pending: "rgba(255,255,255,0.15)",
  accepted: "rgba(76,175,80,0.5)",
  edited: "rgba(33,150,243,0.5)",
  rejected: "rgba(244,67,54,0.3)",
};

/**
 * Extract a short name from "Name: description..." content format.
 * Falls back to first line or first 40 chars.
 */
function extractNodeName(content: string): string {
  const colon = content.indexOf(":");
  if (colon > 0 && colon < 60) return content.slice(0, colon).trim();
  const nl = content.indexOf("\n");
  if (nl > 0) return content.slice(0, nl).trim().slice(0, 40);
  return content.trim().slice(0, 40);
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
    },
    cardNudge: {
      "border-left": "3px solid #ff9800",
    },
    cardAccepted: {
      "border-left": "3px solid rgba(76,175,80,0.7)",
    },
    cardEdited: {
      "border-left": "3px solid rgba(33,150,243,0.7)",
    },
    cardRejected: {
      opacity: "0.5",
      "border-left": "3px solid rgba(244,67,54,0.4)",
    },
    headerRow: {
      "align-items": "center",
      gap: "4px",
    },
    kindBadge: {
      "font-size": "0.65em",
      opacity: "0.5",
      "text-transform": "uppercase",
      "letter-spacing": "0.5px",
    },
    nameText: {
      flex: "1",
      "font-size": "0.85em",
      "font-weight": "bold",
      "word-break": "break-word",
    },
    nameTextRejected: {
      "text-decoration": "line-through",
      opacity: "0.7",
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
      opacity: "0.7",
      "word-break": "break-word",
    },
    servesRow: {
      gap: "4px",
      "flex-wrap": "wrap",
    },
    servesTag: {
      "font-size": "0.7em",
      opacity: "0.6",
      padding: "1px 4px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.06)",
    },
    servesRowHidden: {
      display: "none",
    },
    actionBtn: {
      padding: "1px 5px",
      "font-size": "0.75em",
    },
    viewContainer: { width: "100%" },
    editContainer: { width: "100%", display: "none" },
    visible: { display: "block" },
    hidden: { display: "none" },
    inputStyle: { width: "100%", "min-height": "60px" },
    saveRow: { "justify-content": "flex-end", "margin-top": "2px", gap: "4px" },
    saveBtn: { padding: "3px 8px", "font-size": "0.8em" },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { node } = props;
    const ids = IDS.CRUCIBLE.node(node.id);

    const acceptNode = () =>
      dispatch(nodeStatusChanged({ id: node.id, status: "accepted" }));
    const rejectNode = () =>
      dispatch(nodeStatusChanged({ id: node.id, status: "rejected" }));

    const enterEdit = () => {
      api.v1.storyStorage.set(`cr-draft-content-${node.id}`, node.content);
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "hidden") },
        { id: ids.EDIT, style: this.style?.("editContainer", "visible") },
      ]);
    };

    const cancelEdit = () => {
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "visible") },
        { id: ids.EDIT, style: this.style?.("editContainer", "hidden") },
      ]);
    };

    const saveEdit = async () => {
      const content = String(
        (await api.v1.storyStorage.get(`cr-draft-content-${node.id}`)) || "",
      );
      dispatch(nodeEdited({ id: node.id, content }));
      api.v1.ui.updateParts([
        { id: ids.VIEW, style: this.style?.("viewContainer", "visible") },
        { id: ids.EDIT, style: this.style?.("editContainer", "hidden") },
      ]);
    };

    // Resolve served node names
    const resolveServedNames = (state: RootState, serves: string[]): string[] => {
      if (serves.length === 0) return [];
      return serves.map((sid) => {
        const served = state.crucible.nodes.find((n) => n.id === sid);
        return served ? extractNodeName(served.content) : sid.slice(0, 8);
      });
    };

    // Reactive: update node display when state changes
    useSelector(
      (state) => state.crucible.nodes.find((n) => n.id === node.id),
      (current) => {
        if (!current) return;

        const name = extractNodeName(current.content);
        const state = ctx.getState();
        const servedNames = resolveServedNames(state, current.serves);

        api.v1.ui.updateParts([
          { id: ids.NAME, text: name },
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

        // Update serves tags
        if (servedNames.length > 0) {
          api.v1.ui.updateParts([
            {
              id: ids.SERVES,
              style: this.style?.("servesRow"),
              content: servedNames.map((sn) =>
                text({ text: `→ ${sn}`, style: this.style?.("servesTag") }),
              ),
            },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: ids.SERVES, style: this.style?.("servesRowHidden") },
          ]);
        }

        // Update card border based on status + origin
        let borderStyle: string;
        if (current.origin === "nudge" && current.status === "pending") {
          borderStyle = "cardNudge";
        } else {
          switch (current.status) {
            case "accepted":
              borderStyle = "cardAccepted";
              break;
            case "edited":
              borderStyle = "cardEdited";
              break;
            case "rejected":
              borderStyle = "cardRejected";
              break;
            default:
              borderStyle = "cardRoot";
          }
        }
        api.v1.ui.updateParts([
          { id: ids.ROOT, style: this.style?.("cardRoot", borderStyle) },
        ]);

        // Update name strikethrough for rejected
        api.v1.ui.updateParts([
          {
            id: ids.NAME,
            style:
              current.status === "rejected"
                ? this.style?.("nameText", "nameTextRejected")
                : this.style?.("nameText"),
          },
        ]);
      },
    );

    // Initial computed values
    const initialName = extractNodeName(node.content);
    const initialState = ctx.getState();
    const initialServedNames = resolveServedNames(initialState, node.serves);

    const initialBorderStyle =
      node.origin === "nudge" && node.status === "pending"
        ? "cardNudge"
        : node.status === "accepted"
          ? "cardAccepted"
          : node.status === "edited"
            ? "cardEdited"
            : node.status === "rejected"
              ? "cardRejected"
              : "cardRoot";

    // -- View Mode --
    const viewContainer = column({
      id: ids.VIEW,
      style: this.style?.("viewContainer"),
      content: [
        row({
          style: this.style?.("headerRow"),
          content: [
            text({
              text: node.kind,
              style: {
                ...this.style?.("kindBadge"),
                color: STATUS_COLORS[node.status],
              },
            }),
            text({
              id: ids.NAME,
              text: initialName,
              style:
                node.status === "rejected"
                  ? this.style?.("nameText", "nameTextRejected")
                  : this.style?.("nameText"),
            }),
            text({
              id: ids.STALE,
              text: "⚠",
              style: node.stale
                ? this.style?.("staleBadge")
                : this.style?.("staleBadgeHidden"),
            }),
            button({
              text: "✓",
              style: this.style?.("actionBtn"),
              callback: acceptNode,
              id: `${ids.ROOT}-accept`,
            }),
            button({
              text: "✎",
              style: this.style?.("actionBtn"),
              callback: enterEdit,
              id: `${ids.ROOT}-edit`,
            }),
            button({
              text: "✗",
              style: this.style?.("actionBtn"),
              callback: rejectNode,
              id: `${ids.ROOT}-reject`,
            }),
          ],
        }),
        text({
          id: ids.CONTENT,
          text: node.content,
          style: this.style?.("contentText"),
          markdown: true,
        }),
        row({
          id: ids.SERVES,
          style: initialServedNames.length > 0
            ? this.style?.("servesRow")
            : this.style?.("servesRowHidden"),
          content: initialServedNames.map((sn) =>
            text({ text: `→ ${sn}`, style: this.style?.("servesTag") }),
          ),
        }),
      ],
    });

    // -- Edit Mode --
    const editContainer = column({
      id: ids.EDIT,
      style: this.style?.("editContainer"),
      content: [
        multilineTextInput({
          id: ids.CONTENT_INPUT,
          storageKey: `story:cr-draft-content-${node.id}`,
          style: {
            ...this.style?.("inputStyle"),
            height: calculateTextAreaHeight(node.content),
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
