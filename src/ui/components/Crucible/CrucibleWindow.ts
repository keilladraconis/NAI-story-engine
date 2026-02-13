import { defineComponent } from "nai-act";
import {
  RootState,
  CrucibleNode,
  CrucibleNodeKind,
  CrucibleStrategy,
  CruciblePhase,
} from "../../../core/store/types";
import {
  crucibleStarted,
  crucibleCommitted,
  crucibleReset,
  uiCrucibleDeepenRequested,
  strategySelected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { NodeCard } from "./NodeCard";
import { GenerationButton } from "../GenerationButton";
import { NAI_HEADER, NAI_FOREGROUND } from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

const KIND_ORDER: CrucibleNodeKind[] = [
  "character",
  "faction",
  "location",
  "system",
  "situation",
  "beat",
  "opener",
];

const KIND_LABELS: Record<CrucibleNodeKind, string> = {
  intent: "INTENT",
  character: "CHARACTERS",
  faction: "FACTIONS",
  location: "LOCATIONS",
  system: "SYSTEMS",
  situation: "SITUATIONS",
  beat: "BEATS",
  opener: "OPENERS",
};

const STRATEGIES: CrucibleStrategy[] = [
  "character-driven",
  "faction-conflict",
  "mystery-revelation",
  "exploration",
  "slice-of-life",
  "custom",
];

const STRATEGY_LABELS: Record<CrucibleStrategy, string> = {
  "character-driven": "Character",
  "faction-conflict": "Faction",
  "mystery-revelation": "Mystery",
  "exploration": "Explore",
  "slice-of-life": "Slice",
  "custom": "Custom",
};

/**
 * Build the phase status string with round/accepted/pending counts.
 */
function buildPhaseText(state: RootState): string {
  const { phase, currentRound, nodes } = state.crucible;
  switch (phase) {
    case "idle":
      return state.crucible.strategy ? "Ready" : "Select a strategy to begin";
    case "seeding":
      return "Extracting intent...";
    case "expanding": {
      const accepted = nodes.filter(
        (n) => n.status === "accepted" || n.status === "edited",
      ).length;
      const pending = nodes.filter((n) => n.status === "pending").length;
      return `Round ${currentRound} · ${accepted} accepted · ${pending} pending`;
    }
    case "committed":
      return "Committed to Story Engine";
  }
}

/**
 * Build grouped content UIParts from node ID list.
 * Intent nodes are rendered first outside kind groups.
 */
function buildGroupedContent(
  nodes: CrucibleNode[],
  nodeParts: Map<string, { part: UIPart; unmount: () => void }>,
  styleRef: (((...names: string[]) => Record<string, string> | undefined) | undefined),
): UIPart[] {
  const content: UIPart[] = [];

  // Intent first (no group header)
  const intentNodes = nodes.filter((n) => n.kind === "intent");
  for (const node of intentNodes) {
    const entry = nodeParts.get(node.id);
    if (entry) content.push(entry.part);
  }

  // Remaining kinds in order
  for (const kind of KIND_ORDER) {
    const kindNodes = nodes.filter((n) => n.kind === kind);
    if (kindNodes.length === 0) continue;

    content.push(
      text({
        id: IDS.CRUCIBLE.kindGroup(kind),
        text: `◆ ${KIND_LABELS[kind]}`,
        style: styleRef?.("kindHeader"),
      }),
    );

    for (const node of kindNodes) {
      const entry = nodeParts.get(node.id);
      if (entry) content.push(entry.part);
    }
  }

  return content;
}

export const CrucibleWindow = defineComponent<void, RootState>({
  id: () => IDS.CRUCIBLE.WINDOW_ROOT,

  styles: {
    root: {
      height: "100%",
      gap: "4px",
      padding: "4px",
    },
    headerRow: {
      "align-items": "center",
      "justify-content": "space-between",
    },
    phaseText: {
      "font-size": "0.8em",
      opacity: "0.8",
    },
    strategyRow: {
      gap: "3px",
      "flex-wrap": "wrap",
    },
    stratBtn: {
      padding: "2px 6px",
      "font-size": "0.75em",
      "border-radius": "12px",
      "background-color": "rgba(255,255,255,0.06)",
      opacity: "0.7",
    },
    stratBtnActive: {
      padding: "2px 6px",
      "font-size": "0.75em",
      "border-radius": "12px",
      "background-color": "rgba(245,243,194,0.2)",
      color: NAI_HEADER,
      opacity: "1",
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
    kindHeader: {
      "font-size": "0.7em",
      opacity: "0.5",
      "text-transform": "uppercase",
      "letter-spacing": "1px",
      "margin-top": "4px",
    },
    footerRow: {
      gap: "4px",
      "flex-wrap": "wrap",
    },
    primaryBtn: {
      padding: "4px 10px",
      "font-weight": "bold",
      background: NAI_HEADER,
      color: NAI_FOREGROUND,
      "border-radius": "4px",
    },
    secondaryBtn: {
      padding: "4px 10px",
      "border-radius": "4px",
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

    // Track mounted node cards
    const nodeParts = new Map<
      string,
      { part: UIPart; unmount: () => void }
    >();

    // --- Read initial state for window reopen (#15) ---
    const initial = ctx.getState();
    const initialPhaseText = buildPhaseText(initial);

    // Mount initial nodes
    for (const node of initial.crucible.nodes) {
      nodeParts.set(node.id, ctx.render(NodeCard, { node }));
    }

    const initialGroupedContent = buildGroupedContent(
      initial.crucible.nodes,
      nodeParts,
      this.style,
    );
    const hasInitialNodes = initial.crucible.nodes.length > 0;

    // -- Header --
    const phaseTextPart = text({
      id: IDS.CRUCIBLE.PHASE_TEXT,
      text: initialPhaseText,
      style: this.style?.("phaseText"),
    });

    // -- Strategy buttons --
    const strategyButtons = STRATEGIES.map((s) =>
      button({
        id: IDS.CRUCIBLE.strategy(s),
        text: STRATEGY_LABELS[s],
        style: s === initial.crucible.strategy
          ? this.style?.("stratBtnActive")
          : this.style?.("stratBtn"),
        callback: () => dispatch(strategySelected({ strategy: s })),
      }),
    );

    // -- Nodes container --
    const emptyState = text({
      id: IDS.CRUCIBLE.EMPTY_STATE,
      text: initial.crucible.strategy
        ? "Ready — click Start Crucible"
        : "Select a strategy to begin",
      style: this.style?.(
        "emptyState",
        hasInitialNodes ? "hidden" : undefined,
      ),
    });

    // -- Footer buttons: GenerationButton for seed & deepen (#1) --
    const { part: seedBtn } = ctx.render(GenerationButton, {
      id: IDS.CRUCIBLE.SEED_BTN,
      label: "Start Crucible",
      generateAction: crucibleStarted(),
      style: {
        ...this.style?.("primaryBtn"),
        display: initial.crucible.phase === "idle" ? "flex" : "none",
      },
      stateProjection: (state: RootState) => ({
        active: state.runtime.activeRequest,
        queue: state.runtime.queue,
      }),
      requestIdFromProjection: (p: { active: any; queue: any[] }) => {
        if (p.active?.type === "crucibleSeed") return p.active.id;
        return p.queue.find((q) => q.type === "crucibleSeed")?.id;
      },
      isDisabledFromProjection: () => false,
    });

    const { part: deepenBtn } = ctx.render(GenerationButton, {
      id: IDS.CRUCIBLE.DEEPEN_BTN,
      label: "Deepen",
      generateAction: uiCrucibleDeepenRequested(),
      style: {
        ...this.style?.("primaryBtn"),
        display: initial.crucible.phase === "expanding" ? "flex" : "none",
      },
      stateProjection: (state: RootState) => ({
        active: state.runtime.activeRequest,
        queue: state.runtime.queue,
      }),
      requestIdFromProjection: (p: { active: any; queue: any[] }) => {
        if (p.active?.type === "crucibleExpand") return p.active.id;
        return p.queue.find((q) => q.type === "crucibleExpand")?.id;
      },
      isDisabledFromProjection: () => false,
    });

    const commitBtn = button({
      id: IDS.CRUCIBLE.COMMIT_BTN,
      text: "Commit to SE",
      iconId: "check-circle",
      style: this.style?.(
        "secondaryBtn",
        initial.crucible.phase === "expanding" ? "visible" : "hidden",
      ),
      callback: () => dispatch(crucibleCommitted()),
    });

    const resetBtn = button({
      id: IDS.CRUCIBLE.RESET_BTN,
      text: "Reset",
      iconId: "rotate-cw",
      style: this.style?.(
        "resetBtn",
        initial.crucible.phase !== "idle" ? "visible" : "hidden",
      ),
      callback: () => dispatch(crucibleReset()),
    });

    // -- Reactive: Phase changes --
    useSelector(
      (state) => state.crucible.phase,
      (phase: CruciblePhase) => {
        // Update phase text with full status
        const state = ctx.getState();
        api.v1.ui.updateParts([
          { id: IDS.CRUCIBLE.PHASE_TEXT, text: buildPhaseText(state) },
        ]);

        // Footer visibility
        const isIdle = phase === "idle";
        const isExpanding = phase === "expanding";
        const isNotIdle = !isIdle;

        api.v1.ui.updateParts([
          {
            id: IDS.CRUCIBLE.SEED_BTN,
            style: {
              ...this.style?.("primaryBtn"),
              display: isIdle ? "flex" : "none",
            },
          },
          {
            id: IDS.CRUCIBLE.DEEPEN_BTN,
            style: {
              ...this.style?.("primaryBtn"),
              display: isExpanding ? "flex" : "none",
            },
          },
          {
            id: IDS.CRUCIBLE.COMMIT_BTN,
            style: this.style?.(
              "secondaryBtn",
              isExpanding ? "visible" : "hidden",
            ),
          },
          {
            id: IDS.CRUCIBLE.RESET_BTN,
            style: this.style?.(
              "resetBtn",
              isNotIdle ? "visible" : "hidden",
            ),
          },
        ]);

        // Update empty state text based on strategy
        if (isIdle) {
          api.v1.ui.updateParts([
            {
              id: IDS.CRUCIBLE.EMPTY_STATE,
              text: state.crucible.strategy
                ? "Ready — click Start Crucible"
                : "Select a strategy to begin",
            },
          ]);
        }
      },
    );

    // -- Reactive: Strategy selection --
    useSelector(
      (state) => state.crucible.strategy,
      (active) => {
        for (const s of STRATEGIES) {
          api.v1.ui.updateParts([
            {
              id: IDS.CRUCIBLE.strategy(s),
              style:
                s === active
                  ? this.style?.("stratBtnActive")
                  : this.style?.("stratBtn"),
            },
          ]);
        }
        // Update empty state text (#5)
        const state = ctx.getState();
        if (state.crucible.phase === "idle") {
          api.v1.ui.updateParts([
            {
              id: IDS.CRUCIBLE.EMPTY_STATE,
              text: active
                ? "Ready — click Start Crucible"
                : "Select a strategy to begin",
            },
          ]);
        }
      },
    );

    // -- Reactive: Round/counts change → update phase text (#14) --
    useSelector(
      (state) => ({
        round: state.crucible.currentRound,
        nodeCount: state.crucible.nodes.length,
      }),
      () => {
        const state = ctx.getState();
        api.v1.ui.updateParts([
          { id: IDS.CRUCIBLE.PHASE_TEXT, text: buildPhaseText(state) },
        ]);
      },
    );

    // -- Reactive: Node list changes → reconcile cards (#9) --
    // Track only ID list to avoid clobbering on property changes
    useSelector(
      (state) => state.crucible.nodes.map((n) => n.id).join(","),
      () => {
        const nodes = ctx.getState().crucible.nodes;
        const nodeIds = new Set(nodes.map((n) => n.id));

        // Mount new nodes
        for (const node of nodes) {
          if (!nodeParts.has(node.id)) {
            nodeParts.set(node.id, ctx.render(NodeCard, { node }));
          }
        }

        // Unmount removed nodes
        for (const [id] of nodeParts) {
          if (!nodeIds.has(id)) {
            nodeParts.get(id)!.unmount();
            nodeParts.delete(id);
          }
        }

        // Rebuild grouped content
        const hasNodes = nodes.length > 0;
        const content = buildGroupedContent(nodes, nodeParts, this.style);

        api.v1.ui.updateParts([
          {
            id: IDS.CRUCIBLE.EMPTY_STATE,
            style: this.style?.(
              "emptyState",
              hasNodes ? "hidden" : undefined,
            ),
          },
        ]);

        api.v1.ui.updateParts([
          {
            id: IDS.CRUCIBLE.NODES_COL,
            content: [emptyState, ...content],
          },
        ]);

        // Also update phase text (counts changed)
        const state = ctx.getState();
        api.v1.ui.updateParts([
          { id: IDS.CRUCIBLE.PHASE_TEXT, text: buildPhaseText(state) },
        ]);
      },
    );

    // Build initial tree
    return column({
      id: IDS.CRUCIBLE.WINDOW_ROOT,
      style: this.style?.("root"),
      content: [
        // Header
        row({
          style: this.style?.("headerRow"),
          content: [phaseTextPart],
        }),
        // Strategy buttons
        row({
          id: IDS.CRUCIBLE.STRATEGY_ROW,
          style: this.style?.("strategyRow"),
          content: strategyButtons,
        }),
        // Nodes container
        column({
          id: IDS.CRUCIBLE.NODES_COL,
          style: this.style?.("nodesCol"),
          content: [emptyState, ...initialGroupedContent],
        }),
        // Footer
        row({
          style: this.style?.("footerRow"),
          content: [seedBtn, deepenBtn, commitBtn, resetBtn],
        }),
      ],
    });
  },
});
