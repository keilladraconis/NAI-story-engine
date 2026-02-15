import { defineComponent } from "nai-act";
import {
  RootState,
  CrucibleNode,
  CrucibleEdge,
  CruciblePhase,
  CrucibleNodeKind,
} from "../../../core/store/types";
import {
  crucibleCommitted,
  crucibleReset,
  nodesPruned,
  uiCrucibleSolveNextRequested,
  crucibleGoalsRequested,
  crucibleStopRequested,
  userGoalAdded,
  userNodeAdded,
  intentEdited,
  nodeFavorited,
  nodeDisfavored,
} from "../../../core/store/slices/crucible";
import { ARC_KINDS, WORLD_KINDS } from "../../../core/utils/crucible-strategy";
import { IDS } from "../../framework/ids";
import { NodeCard } from "./NodeCard";
import { GenerationButton } from "../GenerationButton";
import { BudgetFeedback } from "../BudgetFeedback";
import { calculateTextAreaHeight } from "../../utils";

const { text, row, column, button, textInput, multilineTextInput } = api.v1.ui.part;

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

// Kinds available for "+ Node" picker (goals have their own button)
const ADDABLE_KINDS: CrucibleNodeKind[] = [
  "character", "faction", "location", "system", "situation", "beat", "opener",
];

// (World nodes rendered in insertion order, no grouping)

/**
 * Decompose arc nodes into per-path columns. Each distinct chain leading to a
 * goal becomes one arc (vertical column). Goals at the bottom, openers at top.
 * If two beats both point to the same goal, that's two separate arcs.
 */
function decomposeArcs(
  nodes: CrucibleNode[],
  edges: CrucibleEdge[],
): { arcs: string[][]; loose: string[] } {
  const arcNodes = new Map(
    nodes.filter((n) => ARC_KINDS.has(n.kind)).map((n) => [n.id, n]),
  );
  const goals = nodes.filter((n) => n.kind === "goal");

  // Build directed predecessors: for each arc node, who points TO it?
  const predecessors = new Map<string, string[]>();
  for (const [id] of arcNodes) predecessors.set(id, []);
  for (const edge of edges) {
    if (arcNodes.has(edge.source) && arcNodes.has(edge.target)) {
      predecessors.get(edge.target)!.push(edge.source);
    }
  }

  const arcs: string[][] = [];
  const inArc = new Set<string>();

  for (const goal of goals) {
    // Walk backwards from goal, splitting at each fork
    const walkBack = (nodeId: string, chain: string[]): void => {
      const preds = predecessors.get(nodeId) || [];
      if (preds.length === 0) {
        // End of chain — emit arc (chain is in reverse order: goal first)
        arcs.push([...chain].reverse()); // top-to-bottom: opener...beats...goal
        chain.forEach((id) => inArc.add(id));
        return;
      }
      for (const pred of preds) {
        if (chain.includes(pred)) continue; // prevent loops
        walkBack(pred, [...chain, pred]);
      }
    };
    walkBack(goal.id, [goal.id]);
  }

  const loose = [...arcNodes.keys()].filter((id) => !inArc.has(id));
  return { arcs, loose };
}

/**
 * Build the status text from runtime + crucible state.
 */
function buildStatusText(state: RootState): string {
  const { phase, nodes, edges, autoSolving } = state.crucible;
  const activeReq = state.runtime.activeRequest;

  if (activeReq?.type === "crucibleGoals") return "Generating goals\u2026";
  if (activeReq?.type === "crucibleIntent") return "Generating intent\u2026";
  if (activeReq?.type === "crucibleSolve" && autoSolving) return "\u26A1 Auto-solving\u2026";
  if (activeReq?.type === "crucibleSolve") return "Solving\u2026";

  switch (phase) {
    case "idle":
      return "Ready";
    case "active":
      return `${nodes.length} nodes \u00B7 ${edges.length} edges`;
    case "committed":
      return "Exported";
  }
}

export const CrucibleWindow = defineComponent<void, RootState>({
  id: () => IDS.CRUCIBLE.WINDOW_ROOT,

  styles: {
    root: {
      height: "100%",
      gap: "4px",
      padding: "6px 12px 6px 6px",
    },
    headerRow: {
      "align-items": "center",
      "justify-content": "space-between",
      gap: "6px",
    },
    statusText: {
      "font-size": "0.8em",
      opacity: "0.8",
      flex: "1",
    },
    intentContainer: {
      gap: "2px",
    },
    intentViewRow: {
      "align-items": "flex-start",
      gap: "4px",
    },
    intentText: {
      flex: "1",
      "font-size": "0.8em",
      opacity: "0.7",
      "font-style": "italic",
      cursor: "pointer",
    },
    intentEditBtn: {
      padding: "1px 5px",
      "font-size": "0.7em",
      opacity: "0.5",
    },
    intentEditContainer: {
      display: "none",
    },
    intentEditContainerVisible: {
      display: "block",
    },
    intentEditInput: {
      width: "100%",
      "min-height": "40px",
    },
    intentSaveRow: {
      "justify-content": "flex-end",
      "margin-top": "2px",
      gap: "4px",
    },
    intentSaveBtn: {
      padding: "3px 8px",
      "font-size": "0.8em",
    },
    strategyInputRow: {
      "align-items": "center",
      gap: "4px",
    },
    strategyLabel: {
      "font-size": "0.7em",
      opacity: "0.5",
    },
    nodesCol: {
      flex: "1",
      overflow: "auto",
      gap: "4px",
      padding: "2px 0",
    },
    emptyState: {
      "font-size": "0.8em",
      opacity: "0.5",
      "text-align": "center",
      padding: "16px 0",
    },
    levelDivider: {
      "border-top": "1px solid rgba(255,255,255,0.1)",
      "margin-top": "4px",
      "padding-top": "4px",
    },
    arcGroup: {
      gap: "2px",
      "border-left": "2px solid rgba(255,255,255,0.08)",
      "padding-left": "6px",
      "margin-bottom": "4px",
      "padding-right": "8px",
    },
    arcLine: {
      "align-items": "center",
      gap: "4px",
    },
    arcLineFavorited: {
      "align-items": "center",
      gap: "4px",
      "border-left": "3px solid rgba(233,30,99,0.7)",
      "padding-left": "4px",
    },
    arcLineDisfavored: {
      "align-items": "center",
      gap: "4px",
      opacity: "0.35",
      "text-decoration": "line-through",
    },
    arcLineEdited: {
      "align-items": "center",
      gap: "4px",
      "border-left": "3px solid rgba(33,150,243,0.7)",
      "padding-left": "4px",
    },
    arcKindBadge: {
      "font-size": "0.65em",
      opacity: "0.9",
      "text-transform": "uppercase",
      "letter-spacing": "0.5px",
      "flex-shrink": "0",
    },
    arcInput: {
      flex: "1",
      "min-height": "1.4em",
      "font-size": "0.85em",
    },
    levelRow: {
      "flex-wrap": "wrap",
      gap: "4px",
    },
    footerRow: {
      gap: "4px",
      "flex-wrap": "wrap",
      "align-items": "center",
    },
    primaryBtn: {
      padding: "4px 10px",
      "font-weight": "bold",
      "border-radius": "4px",
    },
    secondaryBtn: {
      padding: "4px 10px",
      "border-radius": "4px",
    },
    addGoalBtn: {
      padding: "4px 10px",
      "border-radius": "4px",
      "font-size": "0.85em",
    },
    addNodeBtn: {
      padding: "4px 10px",
      "border-radius": "4px",
      "font-size": "0.85em",
    },
    kindRow: {
      gap: "4px",
      "flex-wrap": "wrap",
      "align-items": "center",
      display: "none",
    },
    kindRowVisible: {
      gap: "4px",
      "flex-wrap": "wrap",
      "align-items": "center",
      display: "flex",
    },
    kindPickerBtn: {
      padding: "2px 6px",
      "font-size": "0.75em",
      "border-radius": "3px",
    },
    resetBtn: {
      padding: "4px 8px",
      opacity: "0.6",
      "border-radius": "4px",
    },
    genBtnRow: {
      "font-size": "0.85em",
    },
    sectionLabel: {
      "font-size": "0.7em",
      opacity: "0.4",
      "text-align": "center",
      "border-top": "1px solid rgba(255,255,255,0.08)",
      "margin-top": "4px",
      "padding-top": "4px",
    },
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    // Track mounted node cards and which ones start in edit mode
    const nodeParts = new Map<
      string,
      { part: UIPart; unmount: () => void }
    >();
    const newNodeIds = new Set<string>();
    let kindRowVisible = false;

    // Build a compact inline line for an arc node
    const buildArcLine = (node: CrucibleNode): UIPart => {
      const kindColor = KIND_COLORS[node.kind] || "#ffffff";
      const storageKey = `cr-arc-content-${node.id}`;

      const lineStyle = node.status === "favorited"
        ? "arcLineFavorited"
        : node.status === "disfavored"
          ? "arcLineDisfavored"
          : node.status === "edited"
            ? "arcLineEdited"
            : "arcLine";

      // Seed storage with current store content
      api.v1.storyStorage.set(storageKey, node.content);

      return row({
        id: `cr-arcnode-${node.id}`,
        style: this.style?.(lineStyle),
        content: [
          text({
            text: node.kind,
            style: { ...this.style?.("arcKindBadge"), color: kindColor },
          }),
          multilineTextInput({
            id: `cr-arcnode-${node.id}-input`,
            storageKey: `story:${storageKey}`,
            initialValue: node.content,
            style: this.style?.("arcInput"),
          }),
          button({
            iconId: "heart",
            callback: () => dispatch(nodeFavorited({ id: node.id })),
            id: `cr-arcnode-${node.id}-fav`,
          }),
          button({
            iconId: "x",
            callback: () => dispatch(nodeDisfavored({ id: node.id })),
            id: `cr-arcnode-${node.id}-dis`,
          }),
        ],
      });
    };

    // Build arc section — each arc is a horizontal group of compact lines
    const buildArcLevels = (nodes: CrucibleNode[], edges: CrucibleEdge[]): UIPart[] => {
      const { arcs, loose } = decomposeArcs(nodes, edges);
      const content: UIPart[] = [];

      if (arcs.length > 0) {
        for (let i = 0; i < arcs.length; i++) {
          const lines: UIPart[] = [];
          for (const id of arcs[i]) {
            const node = nodes.find((n) => n.id === id);
            if (!node) continue;
            lines.push(buildArcLine(node));
          }
          if (lines.length === 0) continue;

          content.push(column({
            id: `cr-arc-${i}`,
            style: this.style?.("arcGroup"),
            content: [
              text({
                id: `cr-arc-label-${i}`,
                text: `\u2014 Arc ${i + 1} \u2014`,
                style: this.style?.("sectionLabel"),
              }),
              ...lines,
            ],
          }));
        }
      }

      // Loose arc nodes — render as NodeCard tiles
      if (loose.length > 0) {
        const looseCards: UIPart[] = [];
        for (const id of loose) {
          const entry = nodeParts.get(id);
          if (entry) looseCards.push(entry.part);
        }
        if (looseCards.length > 0) {
          content.push(text({
            id: "cr-loose-label",
            text: "\u2014 Loose \u2014",
            style: this.style?.("sectionLabel"),
          }));
          content.push(row({
            id: "cr-level-loose",
            style: this.style?.("levelRow"),
            content: looseCards,
          }));
        }
      }

      return content;
    };

    // Build world section — insertion order, no grouping
    const buildWorldSection = (nodes: CrucibleNode[]): UIPart[] => {
      const worldNodes = nodes.filter((n) => WORLD_KINDS.has(n.kind));
      if (worldNodes.length === 0) return [];

      const cards: UIPart[] = [];
      for (const node of worldNodes) {
        const entry = nodeParts.get(node.id);
        if (entry) cards.push(entry.part);
      }
      if (cards.length === 0) return [];

      return [
        text({
          id: "cr-world-label",
          text: "\u2014 World \u2014",
          style: this.style?.("sectionLabel"),
        }),
        row({
          id: "cr-world-row",
          style: this.style?.("levelRow"),
          content: cards,
        }),
      ];
    };

    // Build full content: arc levels + world section
    const buildLevelContent = (nodes: CrucibleNode[], edges: CrucibleEdge[]): UIPart[] => {
      return [...buildArcLevels(nodes, edges), ...buildWorldSection(nodes)];
    };

    // Rebuild the nodes container from current state
    const rebuildContent = () => {
      const state = ctx.getState();
      const nodes = state.crucible.nodes;
      const hasNodes = nodes.length > 0;
      const content = buildLevelContent(nodes, state.crucible.edges);

      api.v1.ui.updateParts([
        {
          id: IDS.CRUCIBLE.EMPTY_STATE,
          style: this.style?.(
            "emptyState",
            hasNodes ? "hidden" : undefined,
          ),
        },
        {
          id: IDS.CRUCIBLE.NODES_COL,
          content: [emptyState, ...content],
        },
      ]);
    };

    // Mount NodeCards only for nodes that need tile rendering (world + loose arc)
    const ensureNodeCards = (nodes: CrucibleNode[], edges: CrucibleEdge[]) => {
      const { loose } = decomposeArcs(nodes, edges);
      const looseSet = new Set(loose);
      const nodeIds = new Set(nodes.map((n) => n.id));

      for (const node of nodes) {
        // Mount NodeCards for world nodes and loose arc nodes
        const needsCard = WORLD_KINDS.has(node.kind) || looseSet.has(node.id);
        if (needsCard && !nodeParts.has(node.id)) {
          const isNew = newNodeIds.has(node.id);
          if (isNew) newNodeIds.delete(node.id);
          nodeParts.set(
            node.id,
            ctx.render(NodeCard, { node, startInEditMode: isNew }),
          );
        }
      }

      // Unmount removed nodes
      for (const [id] of nodeParts) {
        if (!nodeIds.has(id)) {
          nodeParts.get(id)!.unmount();
          nodeParts.delete(id);
        }
      }
    };

    // --- Read initial state ---
    const initial = ctx.getState();
    const initialStatusText = buildStatusText(initial);

    // Mount initial node cards (world + loose arc only)
    ensureNodeCards(initial.crucible.nodes, initial.crucible.edges);

    const initialLevelContent = buildLevelContent(initial.crucible.nodes, initial.crucible.edges);
    const hasInitialNodes = initial.crucible.nodes.length > 0;
    const isActive = initial.crucible.phase === "active";
    const isSolving = initial.crucible.autoSolving;
    const activeSolve = initial.runtime.activeRequest?.type === "crucibleSolve";

    // -- Header with status + BudgetFeedback --
    const statusTextPart = text({
      id: IDS.CRUCIBLE.STATUS_TEXT,
      text: initialStatusText,
      style: this.style?.("statusText"),
    });

    const { part: budgetFeedbackPart } = ctx.render(BudgetFeedback, { id: "cr-budget" });

    // -- Intent display (editable) --
    const intentViewId = "cr-intent-view";
    const intentEditId = "cr-intent-edit";

    const enterIntentEdit = () => {
      const state = ctx.getState();
      const content = state.crucible.intent || "";
      api.v1.storyStorage.set("cr-intent-draft", content);
      api.v1.ui.updateParts([
        { id: intentViewId, style: this.style?.("intentViewRow", "hidden") },
        { id: intentEditId, style: this.style?.("intentEditContainerVisible") },
        { id: "cr-intent-input", style: {
          ...this.style?.("intentEditInput"),
          height: calculateTextAreaHeight(content),
        }},
      ]);
    };

    const cancelIntentEdit = () => {
      api.v1.ui.updateParts([
        { id: intentViewId, style: this.style?.("intentViewRow") },
        { id: intentEditId, style: this.style?.("intentEditContainer") },
      ]);
    };

    const saveIntentEdit = async () => {
      const content = String(
        (await api.v1.storyStorage.get("cr-intent-draft")) || "",
      );
      if (content.trim()) {
        dispatch(intentEdited({ intent: content.trim() }));
      }
      api.v1.ui.updateParts([
        { id: intentViewId, style: this.style?.("intentViewRow") },
        { id: intentEditId, style: this.style?.("intentEditContainer") },
      ]);
    };

    // -- Intent GenerationButton (icon variant) --
    const { part: intentGenIconPart } = ctx.render(GenerationButton, {
      id: IDS.CRUCIBLE.INTENT_BTN,
      variant: "icon",
      iconId: "zap",
      stateProjection: (state: RootState) => ({
        activeReqId: state.runtime.activeRequest?.type === "crucibleIntent"
          ? state.runtime.activeRequest.id
          : undefined,
        queuedIds: state.runtime.queue
          .filter((q) => q.type === "crucibleIntent")
          .map((q) => q.id),
      }),
      requestIdFromProjection: (proj: { activeReqId?: string; queuedIds: string[] }) =>
        proj.activeReqId || proj.queuedIds[0],
      onGenerate: () => dispatch(crucibleGoalsRequested()),
      onCancel: () => dispatch(crucibleStopRequested()),
    });

    const intentContainer = column({
      id: IDS.CRUCIBLE.INTENT_TEXT,
      style: this.style?.("intentContainer"),
      content: [
        row({
          id: intentViewId,
          style: this.style?.("intentViewRow"),
          content: [
            text({
              id: "cr-intent-content",
              text: initial.crucible.intent || "No intent \u2014 press Solve to generate",
              style: this.style?.("intentText"),
              markdown: true,
            }),
            intentGenIconPart,
            button({
              iconId: "edit",
              style: this.style?.("intentEditBtn"),
              callback: enterIntentEdit,
              id: "cr-intent-edit-btn",
            }),
          ],
        }),
        column({
          id: intentEditId,
          style: this.style?.("intentEditContainer"),
          content: [
            multilineTextInput({
              id: "cr-intent-input",
              storageKey: "story:cr-intent-draft",
              style: this.style?.("intentEditInput"),
              initialValue: initial.crucible.intent || "",
            }),
            row({
              style: this.style?.("intentSaveRow"),
              content: [
                button({
                  text: "Cancel",
                  style: this.style?.("intentSaveBtn"),
                  callback: cancelIntentEdit,
                  id: "cr-intent-cancel",
                }),
                button({
                  text: "Save",
                  iconId: "save",
                  style: this.style?.("intentSaveBtn"),
                  callback: saveIntentEdit,
                  id: "cr-intent-save",
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // -- Strategy: simple text input with storageKey --
    // Seed storage on mount
    api.v1.storyStorage.set("cr-strategy-value", initial.crucible.strategyLabel || "");

    const strategyRow = row({
      id: "cr-strategy-row",
      style: this.style?.("strategyInputRow"),
      content: [
        text({ text: "Strategy:", style: this.style?.("strategyLabel") }),
        textInput({
          id: "cr-strategy-input",
          initialValue: initial.crucible.strategyLabel || "",
          placeholder: "e.g. character-driven",
          storageKey: "story:cr-strategy-value",
          style: { flex: "1", "font-size": "0.7em", opacity: "0.7" },
        }),
      ],
    });

    // -- Nodes container --
    const emptyState = text({
      id: IDS.CRUCIBLE.EMPTY_STATE,
      text: "Generate or add goals to get started.",
      style: this.style?.(
        "emptyState",
        hasInitialNodes ? "hidden" : undefined,
      ),
    });

    // -- Goals GenerationButton (button variant in footer) --
    const { part: goalsBtnPart } = ctx.render(GenerationButton, {
      id: IDS.CRUCIBLE.GOALS_BTN,
      variant: "button",
      label: "Goals",
      iconId: "zap",
      style: this.style?.("genBtnRow"),
      stateProjection: (state: RootState) => ({
        activeReqId: state.runtime.activeRequest?.type === "crucibleGoals"
          ? state.runtime.activeRequest.id
          : undefined,
        queuedIds: state.runtime.queue
          .filter((q) => q.type === "crucibleGoals")
          .map((q) => q.id),
      }),
      requestIdFromProjection: (proj: { activeReqId?: string; queuedIds: string[] }) =>
        proj.activeReqId || proj.queuedIds[0],
      onGenerate: () => dispatch(crucibleGoalsRequested()),
      onCancel: () => dispatch(crucibleStopRequested()),
    });

    // -- Solve/Stop swap — only react to crucibleSolve --
    const solveBtn = button({
      id: IDS.CRUCIBLE.SOLVE_BTN,
      text: "Solve \u25B6",
      style: {
        ...this.style?.("primaryBtn"),
        display: isSolving || activeSolve ? "none" : "flex",
      },
      callback: () => dispatch(uiCrucibleSolveNextRequested()),
    });

    const stopBtn = button({
      id: IDS.CRUCIBLE.STOP_BTN,
      text: "Stop \u25A0",
      style: {
        ...this.style?.("primaryBtn"),
        display: isSolving || activeSolve ? "flex" : "none",
      },
      callback: () => dispatch(crucibleStopRequested()),
    });

    // -- Other footer buttons --
    const addGoalBtn = button({
      id: IDS.CRUCIBLE.ADD_GOAL_BTN,
      text: "+ Goal",
      style: this.style?.("addGoalBtn"),
      callback: () => dispatch(userGoalAdded()),
    });

    // Kind picker row (hidden by default)
    const kindPickerButtons = ADDABLE_KINDS.map((kind) =>
      button({
        id: `cr-kind-pick-${kind}`,
        text: kind,
        style: {
          ...this.style?.("kindPickerBtn"),
          color: KIND_COLORS[kind],
        },
        callback: () => {
          dispatch(userNodeAdded({ kind }));
          const updated = ctx.getState();
          const newNode = updated.crucible.nodes[updated.crucible.nodes.length - 1];
          if (newNode && !nodeParts.has(newNode.id)) {
            newNodeIds.add(newNode.id);
          }
        },
      }),
    );

    const kindRow = row({
      id: IDS.CRUCIBLE.KIND_ROW,
      style: this.style?.("kindRow"),
      content: kindPickerButtons,
    });

    const addNodeBtn = button({
      id: IDS.CRUCIBLE.ADD_NODE_BTN,
      text: "+ Node",
      style: this.style?.("addNodeBtn"),
      callback: () => {
        kindRowVisible = !kindRowVisible;
        api.v1.ui.updateParts([{
          id: IDS.CRUCIBLE.KIND_ROW,
          style: kindRowVisible
            ? this.style?.("kindRowVisible")
            : this.style?.("kindRow"),
        }]);
      },
    });

    const pruneBtn = button({
      id: IDS.CRUCIBLE.PRUNE_BTN,
      text: "Prune",
      iconId: "scissors",
      style: this.style?.(
        "secondaryBtn",
        isActive ? "visible" : "hidden",
      ),
      callback: () => dispatch(nodesPruned()),
    });

    const commitBtn = button({
      id: IDS.CRUCIBLE.COMMIT_BTN,
      text: "Commit",
      iconId: "check-circle",
      style: this.style?.(
        "secondaryBtn",
        isActive ? "visible" : "hidden",
      ),
      callback: () => dispatch(crucibleCommitted()),
    });

    const resetBtn = button({
      id: IDS.CRUCIBLE.RESET_BTN,
      text: "Reset",
      iconId: "rotate-cw",
      style: this.style?.(
        "resetBtn",
        initial.crucible.nodes.length > 0 || initial.crucible.intent ? "visible" : "hidden",
      ),
      callback: () => dispatch(crucibleReset()),
    });

    // -- Reactive: Update Solve/Stop swap + status on runtime changes --
    const updateControls = () => {
      const state = ctx.getState();
      const phase = state.crucible.phase;
      const phaseIsActive = phase === "active";
      const activeReq = state.runtime.activeRequest;
      const isActiveSolve = activeReq?.type === "crucibleSolve";
      const solving = state.crucible.autoSolving;
      const showStop = !!isActiveSolve || solving;

      api.v1.ui.updateParts([
        { id: IDS.CRUCIBLE.STATUS_TEXT, text: buildStatusText(state) },
        // Solve/Stop swap — only for solve ops
        {
          id: IDS.CRUCIBLE.SOLVE_BTN,
          style: {
            ...this.style?.("primaryBtn"),
            display: showStop ? "none" : "flex",
          },
        },
        {
          id: IDS.CRUCIBLE.STOP_BTN,
          style: {
            ...this.style?.("primaryBtn"),
            display: showStop ? "flex" : "none",
          },
        },
        {
          id: IDS.CRUCIBLE.PRUNE_BTN,
          style: this.style?.(
            "secondaryBtn",
            phaseIsActive ? "visible" : "hidden",
          ),
        },
        {
          id: IDS.CRUCIBLE.COMMIT_BTN,
          style: this.style?.(
            "secondaryBtn",
            phaseIsActive ? "visible" : "hidden",
          ),
        },
        {
          id: IDS.CRUCIBLE.RESET_BTN,
          style: this.style?.(
            "resetBtn",
            state.crucible.nodes.length > 0 || state.crucible.intent ? "visible" : "hidden",
          ),
        },
      ]);
    };

    // -- Reactive: Phase changes --
    useSelector(
      (state) => state.crucible.phase,
      (_phase: CruciblePhase) => updateControls(),
    );

    // -- Reactive: Runtime changes (activeRequest) --
    useSelector(
      (state) => ({
        activeType: state.runtime.activeRequest?.type,
        activeId: state.runtime.activeRequest?.id,
      }),
      () => updateControls(),
    );

    // -- Reactive: autoSolving status --
    useSelector(
      (state) => state.crucible.autoSolving,
      () => updateControls(),
    );

    // -- Reactive: Intent text updates --
    useSelector(
      (state) => state.crucible.intent,
      (intent) => {
        api.v1.ui.updateParts([
          {
            id: "cr-intent-content",
            text: intent || "No intent \u2014 press Solve to generate",
          },
        ]);
      },
    );

    // -- Reactive: Strategy label sync to storyStorage + UI input --
    useSelector(
      (state) => state.crucible.strategyLabel,
      (strategy) => {
        const val = strategy || "";
        api.v1.storyStorage.set("cr-strategy-value", val);
        api.v1.ui.updateParts([{ id: "cr-strategy-input", value: val }]);
      },
    );

    // -- Reactive: Node/edge changes → reconcile cards + rebuild layout --
    // Broader selector: triggers on node IDs, content, status, and edges
    useSelector(
      (state) => ({
        sig: state.crucible.nodes.map((n) => `${n.id}:${n.content.length}:${n.status}`).join(","),
        edgeSig: state.crucible.edges.length,
      }),
      () => {
        const state = ctx.getState();
        ensureNodeCards(state.crucible.nodes, state.crucible.edges);
        rebuildContent();
        updateControls();
      },
    );

    // Intercept userGoalAdded to track new goal IDs for edit mode
    const addGoalWithEditMode = () => {
      dispatch(userGoalAdded());
      const updated = ctx.getState();
      const newNode = updated.crucible.nodes[updated.crucible.nodes.length - 1];
      if (newNode && newNode.kind === "goal" && !nodeParts.has(newNode.id)) {
        newNodeIds.add(newNode.id);
      }
    };

    // Override the callback after creation
    api.v1.ui.updateParts([{
      id: IDS.CRUCIBLE.ADD_GOAL_BTN,
      callback: addGoalWithEditMode,
    }]);

    // Build window
    return column({
      id: IDS.CRUCIBLE.WINDOW_ROOT,
      style: this.style?.("root"),
      content: [
        // Header with status + budget feedback
        row({
          style: this.style?.("headerRow"),
          content: [statusTextPart, budgetFeedbackPart],
        }),
        // Intent
        intentContainer,
        // Strategy (simple text input)
        strategyRow,
        // Nodes container (BFS grid)
        column({
          id: IDS.CRUCIBLE.NODES_COL,
          style: this.style?.("nodesCol"),
          content: [emptyState, ...initialLevelContent],
        }),
        // Kind picker row
        kindRow,
        // Single footer row: Goals, Solve/Stop, + Goal, + Node, Prune, Commit, Reset
        row({
          style: this.style?.("footerRow"),
          content: [goalsBtnPart, solveBtn, stopBtn, addGoalBtn, addNodeBtn, pruneBtn, commitBtn, resetBtn],
        }),
      ],
    });
  },
});
