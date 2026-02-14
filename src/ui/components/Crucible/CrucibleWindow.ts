import { defineComponent } from "nai-act";
import {
  RootState,
  CrucibleNode,
  CrucibleEdge,
  CruciblePhase,
  CrucibleNodeKind,
} from "../../../core/store/types";
import {
  crucibleStarted,
  crucibleCommitted,
  crucibleReset,
  nodesPruned,
  uiCrucibleSolveNextRequested,
  crucibleGoalsRequested,
  crucibleStopRequested,
  userGoalAdded,
  userNodeAdded,
  intentEdited,
} from "../../../core/store/slices/crucible";
import {
  uiUserPresenceConfirmed,
} from "../../../core/store";
import { IDS } from "../../framework/ids";
import { NodeCard } from "./NodeCard";

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

// Kinds available for "+ Node" picker (goals have their own button)
const ADDABLE_KINDS: CrucibleNodeKind[] = [
  "character", "faction", "location", "system", "situation", "beat", "opener",
];

/**
 * BFS-level layout: assign each node a "level" based on distance from goals.
 * Goals are level 0. Nodes connected to goals are level 1, etc.
 * Unconnected nodes go into a "loose" group.
 */
function buildLevelLayout(
  nodes: CrucibleNode[],
  edges: CrucibleEdge[],
): { levels: string[][]; loose: string[] } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const visited = new Map<string, number>(); // id → level
  const queue: string[] = [];

  // Level 0: all goal nodes
  for (const node of nodes) {
    if (node.kind === "goal") {
      visited.set(node.id, 0);
      queue.push(node.id);
    }
  }

  // BFS outward via edges (undirected)
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentLevel = visited.get(current)!;
    for (const edge of edges) {
      const neighbor =
        edge.source === current ? edge.target :
        edge.target === current ? edge.source : null;
      if (neighbor && nodeIds.has(neighbor) && !visited.has(neighbor)) {
        visited.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Group by level
  const levelMap = new Map<number, string[]>();
  const loose: string[] = [];

  for (const node of nodes) {
    const level = visited.get(node.id);
    if (level !== undefined) {
      const arr = levelMap.get(level) || [];
      arr.push(node.id);
      levelMap.set(level, arr);
    } else {
      loose.push(node.id);
    }
  }

  // Sort levels
  const sortedKeys = [...levelMap.keys()].sort((a, b) => a - b);
  const levels = sortedKeys.map((k) => levelMap.get(k)!);

  return { levels, loose };
}

/**
 * Build the status text from runtime + crucible state.
 */
function buildStatusText(state: RootState): string {
  const { phase, nodes, edges, autoSolving } = state.crucible;
  const activeReq = state.runtime.activeRequest;

  if (activeReq?.type === "crucibleGoals") return "Generating goals\u2026";
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
    continueBtn: {
      padding: "2px 8px",
      "font-size": "0.75em",
      "border-radius": "3px",
    },
    continueBtnHidden: {
      display: "none",
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
    strategyBadge: {
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
    primaryBtnDisabled: {
      padding: "4px 10px",
      "font-weight": "bold",
      "border-radius": "4px",
      opacity: "0.35",
      cursor: "not-allowed",
    },
    secondaryBtn: {
      padding: "4px 10px",
      "border-radius": "4px",
    },
    secondaryBtnDisabled: {
      padding: "4px 10px",
      "border-radius": "4px",
      opacity: "0.35",
      cursor: "not-allowed",
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

    // Build BFS-level content
    const buildLevelContent = (nodes: CrucibleNode[], edges: CrucibleEdge[]): UIPart[] => {
      const { levels, loose } = buildLevelLayout(nodes, edges);
      const content: UIPart[] = [];

      for (let i = 0; i < levels.length; i++) {
        const levelNodes = levels[i];
        const cards: UIPart[] = [];
        for (const id of levelNodes) {
          const entry = nodeParts.get(id);
          if (entry) cards.push(entry.part);
        }
        if (cards.length === 0) continue;

        const levelRow = row({
          id: `cr-level-${i}`,
          style: i > 0
            ? { ...this.style?.("levelRow"), ...this.style?.("levelDivider") }
            : this.style?.("levelRow"),
          content: cards,
        });
        content.push(levelRow);
      }

      // Loose nodes
      if (loose.length > 0) {
        const looseCards: UIPart[] = [];
        for (const id of loose) {
          const entry = nodeParts.get(id);
          if (entry) looseCards.push(entry.part);
        }
        if (looseCards.length > 0) {
          content.push(
            row({
              id: "cr-level-loose",
              style: { ...this.style?.("levelRow"), ...this.style?.("levelDivider") },
              content: looseCards,
            }),
          );
        }
      }

      return content;
    };

    // --- Read initial state ---
    const initial = ctx.getState();
    const initialStatusText = buildStatusText(initial);

    // Mount initial nodes
    for (const node of initial.crucible.nodes) {
      nodeParts.set(node.id, ctx.render(NodeCard, { node }));
    }

    const initialLevelContent = buildLevelContent(initial.crucible.nodes, initial.crucible.edges);
    const hasInitialNodes = initial.crucible.nodes.length > 0;
    const isActive = initial.crucible.phase === "active";
    const isIdle = initial.crucible.phase === "idle";
    const isGenerating = !!initial.runtime.activeRequest &&
      (initial.runtime.activeRequest.type === "crucibleGoals" || initial.runtime.activeRequest.type === "crucibleSolve");

    // -- Header with status --
    const statusTextPart = text({
      id: IDS.CRUCIBLE.STATUS_TEXT,
      text: initialStatusText,
      style: this.style?.("statusText"),
    });

    // Continue/Wait buttons (visible when genx paused)
    const continueBtn = button({
      id: "cr-continue-btn",
      text: "\u26A0 Continue",
      style: this.style?.("continueBtnHidden"),
      callback: () => dispatch(uiUserPresenceConfirmed()),
    });

    const waitBtn = button({
      id: "cr-wait-btn",
      text: "\u23F3 Wait",
      style: this.style?.("continueBtnHidden"),
      callback: () => dispatch(uiUserPresenceConfirmed()),
    });

    // -- Intent display (editable) --
    const intentViewId = "cr-intent-view";
    const intentEditId = "cr-intent-edit";

    const enterIntentEdit = () => {
      const state = ctx.getState();
      api.v1.storyStorage.set("cr-intent-draft", state.crucible.intent || "");
      api.v1.ui.updateParts([
        { id: intentViewId, style: this.style?.("intentViewRow", "hidden") },
        { id: intentEditId, style: this.style?.("intentEditContainerVisible") },
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
              text: initial.crucible.intent || "No intent \u2014 click \u270E to set",
              style: this.style?.("intentText"),
              markdown: true,
            }),
            button({
              text: "\u270E",
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

    const strategyTextPart = text({
      id: IDS.CRUCIBLE.STRATEGY_TEXT,
      text: initial.crucible.strategyLabel
        ? `Strategy: ${initial.crucible.strategyLabel}`
        : "",
      style: this.style?.(
        "strategyBadge",
        initial.crucible.strategyLabel ? undefined : "hidden",
      ),
    });

    // -- Nodes container --
    const emptyState = text({
      id: IDS.CRUCIBLE.EMPTY_STATE,
      text: "Ready \u2014 add goals or click Start",
      style: this.style?.(
        "emptyState",
        hasInitialNodes ? "hidden" : undefined,
      ),
    });

    // -- Footer buttons (plain buttons, no GenerationButton) --
    // Buttons use disabled styling instead of hiding so layout stays stable.
    // A button is "shown" when its phase is right, "disabled" when generating.
    // Stop is the only button that hides (only visible when there's something to stop).
    const noop = () => {};

    const startBtn = button({
      id: IDS.CRUCIBLE.START_BTN,
      text: "Start",
      style: {
        ...this.style?.(isIdle ? (isGenerating ? "primaryBtnDisabled" : "primaryBtn") : "primaryBtn"),
        display: isIdle ? "flex" : "none",
      },
      callback: isGenerating ? noop : () => dispatch(crucibleStarted()),
    });

    const goalsBtn = button({
      id: IDS.CRUCIBLE.GOALS_BTN,
      text: "\u21BB Goals",
      style: {
        ...this.style?.(isActive ? (isGenerating ? "secondaryBtnDisabled" : "secondaryBtn") : "secondaryBtn"),
        display: isActive ? "flex" : "none",
      },
      callback: isGenerating ? noop : () => dispatch(crucibleGoalsRequested()),
    });

    const solveBtn = button({
      id: IDS.CRUCIBLE.SOLVE_BTN,
      text: "Solve \u25B6",
      style: {
        ...this.style?.(isActive ? (isGenerating || initial.crucible.autoSolving ? "primaryBtnDisabled" : "primaryBtn") : "primaryBtn"),
        display: isActive ? "flex" : "none",
      },
      callback: isGenerating || initial.crucible.autoSolving ? noop : () => dispatch(uiCrucibleSolveNextRequested()),
    });

    const stopBtn = button({
      id: IDS.CRUCIBLE.STOP_BTN,
      text: "Stop \u25A0",
      style: {
        ...this.style?.("primaryBtn"),
        display: isGenerating || initial.crucible.autoSolving ? "flex" : "none",
      },
      callback: () => dispatch(crucibleStopRequested()),
    });

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
        !isIdle ? "visible" : "hidden",
      ),
      callback: () => dispatch(crucibleReset()),
    });

    // -- Reactive: Update button visibility + status on phase/runtime changes --
    const updateControls = () => {
      const state = ctx.getState();
      const phase = state.crucible.phase;
      const phaseIsIdle = phase === "idle";
      const phaseIsActive = phase === "active";
      const isNotIdle = !phaseIsIdle;
      const activeReq = state.runtime.activeRequest;
      const generating = !!activeReq &&
        (activeReq.type === "crucibleGoals" || activeReq.type === "crucibleSolve");
      const solving = state.crucible.autoSolving;
      const genxStatus = state.runtime.genx.status;

      const startDisabled = generating;
      const goalsDisabled = generating;
      const solveDisabled = generating || solving;

      api.v1.ui.updateParts([
        { id: IDS.CRUCIBLE.STATUS_TEXT, text: buildStatusText(state) },
        {
          id: IDS.CRUCIBLE.START_BTN,
          style: {
            ...this.style?.(startDisabled ? "primaryBtnDisabled" : "primaryBtn"),
            display: phaseIsIdle ? "flex" : "none",
          },
          callback: startDisabled ? noop : () => dispatch(crucibleStarted()),
        },
        {
          id: IDS.CRUCIBLE.GOALS_BTN,
          style: {
            ...this.style?.(goalsDisabled ? "secondaryBtnDisabled" : "secondaryBtn"),
            display: phaseIsActive ? "flex" : "none",
          },
          callback: goalsDisabled ? noop : () => dispatch(crucibleGoalsRequested()),
        },
        {
          id: IDS.CRUCIBLE.SOLVE_BTN,
          style: {
            ...this.style?.(solveDisabled ? "primaryBtnDisabled" : "primaryBtn"),
            display: phaseIsActive ? "flex" : "none",
          },
          callback: solveDisabled ? noop : () => dispatch(uiCrucibleSolveNextRequested()),
        },
        {
          id: IDS.CRUCIBLE.STOP_BTN,
          style: {
            ...this.style?.("primaryBtn"),
            display: generating || solving ? "flex" : "none",
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
            isNotIdle ? "visible" : "hidden",
          ),
        },
        // Continue/Wait buttons
        {
          id: "cr-continue-btn",
          style: genxStatus === "waiting_for_user"
            ? this.style?.("continueBtn")
            : this.style?.("continueBtnHidden"),
        },
        {
          id: "cr-wait-btn",
          style: genxStatus === "waiting_for_budget"
            ? this.style?.("continueBtn")
            : this.style?.("continueBtnHidden"),
        },
      ]);
    };

    // -- Reactive: Phase changes --
    useSelector(
      (state) => state.crucible.phase,
      (_phase: CruciblePhase) => updateControls(),
    );

    // -- Reactive: Runtime changes (activeRequest, genx status) --
    useSelector(
      (state) => ({
        activeType: state.runtime.activeRequest?.type,
        activeId: state.runtime.activeRequest?.id,
        genxStatus: state.runtime.genx.status,
      }),
      () => updateControls(),
    );

    // -- Reactive: autoSolving status --
    useSelector(
      (state) => state.crucible.autoSolving,
      () => updateControls(),
    );

    // -- Reactive: Intent/strategy text updates --
    useSelector(
      (state) => ({
        intent: state.crucible.intent,
        strategy: state.crucible.strategyLabel,
      }),
      (slice) => {
        api.v1.ui.updateParts([
          {
            id: "cr-intent-content",
            text: slice.intent || "No intent \u2014 click \u270E to set",
          },
          {
            id: IDS.CRUCIBLE.STRATEGY_TEXT,
            text: slice.strategy ? `Strategy: ${slice.strategy}` : "",
            style: this.style?.(
              "strategyBadge",
              slice.strategy ? undefined : "hidden",
            ),
          },
        ]);
      },
    );

    // -- Reactive: Node list changes → reconcile cards --
    useSelector(
      (state) => state.crucible.nodes.map((n) => n.id).join(","),
      () => {
        const state = ctx.getState();
        const nodes = state.crucible.nodes;
        const nodeIds = new Set(nodes.map((n) => n.id));

        // Mount new nodes — check if any should start in edit mode
        for (const node of nodes) {
          if (!nodeParts.has(node.id)) {
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

        // Rebuild BFS-level content
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
        // Header with status + continue/wait
        row({
          style: this.style?.("headerRow"),
          content: [statusTextPart, continueBtn, waitBtn],
        }),
        // Intent + strategy
        intentContainer,
        strategyTextPart,
        // Nodes container (BFS grid)
        column({
          id: IDS.CRUCIBLE.NODES_COL,
          style: this.style?.("nodesCol"),
          content: [emptyState, ...initialLevelContent],
        }),
        // Kind picker row
        kindRow,
        // Footer
        row({
          style: this.style?.("footerRow"),
          content: [startBtn, goalsBtn, solveBtn, stopBtn, addGoalBtn, addNodeBtn, pruneBtn, commitBtn, resetBtn],
        }),
      ],
    });
  },
});
