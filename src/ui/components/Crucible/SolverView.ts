import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  crucibleChainRequested,
  autoChainStarted,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { parseTag } from "../../../core/utils/tag-parser";
import {
  NAI_HEADER,
  NAI_DARK_BACKGROUND,
  STATUS_EMPTY,
  STATUS_GENERATING,
  STATUS_COMPLETE,
  STATUS_QUEUED,
} from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const SolverView = defineComponent<undefined, RootState>({
  id: () => "cr-solver-view",

  styles: {
    hidden: { display: "none" },
    streamText: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      opacity: "0.8",
      "min-height": "1.2em",
    },
    buttonRow: {
      gap: "6px",
      "flex-wrap": "wrap",
    },
    btn: {
      padding: "5px 10px",
      "font-size": "0.8em",
    },
    btnPrimary: {
      padding: "5px 10px",
      "font-size": "0.8em",
      "background-color": NAI_HEADER,
      color: NAI_DARK_BACKGROUND,
      "font-weight": "bold",
    },
    goalSection: {
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.02)",
      overflow: "hidden",
    },
    goalHeader: {
      padding: "6px 8px",
      cursor: "pointer",
      "font-size": "0.8em",
      gap: "6px",
      "align-items": "center",
    },
    goalTitle: {
      "font-size": "0.85em",
      "font-weight": "bold",
      flex: "1",
      overflow: "hidden",
      "text-overflow": "ellipsis",
      "white-space": "nowrap",
    },
    goalMeta: {
      "font-size": "0.7em",
      opacity: "0.6",
      "white-space": "nowrap",
    },
    goalBody: {
      padding: "4px 8px 8px",
      gap: "4px",
    },
    beatCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(120,144,156,0.5)",
      gap: "2px",
    },
    beatText: {
      "font-size": "0.8em",
      "white-space": "pre-wrap",
    },
    constraintOpen: {
      "font-size": "0.75em",
      color: STATUS_GENERATING,
    },
    constraintResolved: {
      "font-size": "0.75em",
      color: STATUS_COMPLETE,
      opacity: "0.5",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // Track collapsed state per goal
    const collapsedGoals = new Set<string>();

    // Rebuild per-goal sections
    useSelector(
      (s) => ({
        goals: s.crucible.goals.filter((g) => g.selected),
        chains: s.crucible.chains,
        activeGoalId: s.crucible.activeGoalId,
        phase: s.crucible.phase,
      }),
      (slice) => {
        if (slice.phase !== "chaining" || slice.goals.length === 0) {
          api.v1.ui.updateParts([
            { id: "cr-goal-sections", style: this.style?.("hidden") },
          ]);
          return;
        }

        const sectionParts = slice.goals.map((goal) => {
          const ids = CR.goal(goal.id);
          const chain = slice.chains[goal.id];
          const isActive = goal.id === slice.activeGoalId;
          const beats = chain?.beats || [];
          const open = chain?.openConstraints || [];
          const resolved = chain?.resolvedConstraints || [];
          const isComplete = chain?.complete || false;
          const isCollapsed = collapsedGoals.has(goal.id);

          // Status color
          let statusColor = STATUS_EMPTY;
          if (isComplete) statusColor = STATUS_COMPLETE;
          else if (isActive) statusColor = STATUS_GENERATING;
          else if (beats.length > 0) statusColor = STATUS_QUEUED;

          // Goal summary text
          const goalText = parseTag(goal.text, "GOAL") || goal.text.slice(0, 50);
          const meta = `${beats.length} beats, ${open.length} open`;

          // Beat cards (newest at bottom)
          const beatParts = beats.map((beat, i) => {
            const scene = parseTag(beat.text, "SCENE") || beat.text.split("\n")[0] || "Beat";
            return column({
              style: this.style?.("beatCard"),
              content: [
                text({
                  text: `Beat ${i + 1}: ${scene}`,
                  style: this.style?.("beatText"),
                }),
              ],
            });
          });

          // Constraints
          const constraintParts = [
            ...open.map((c) =>
              text({
                text: `\u25CB ${c.description}`,
                style: this.style?.("constraintOpen"),
              }),
            ),
            ...resolved.slice(-3).map((c) =>
              text({
                text: `\u25CF ${c.description}`,
                style: this.style?.("constraintResolved"),
              }),
            ),
          ];

          const bodyContent = isCollapsed ? [] : [...beatParts, ...constraintParts];

          const chevron = isCollapsed ? "▶" : "▼";
          const headerLabel = `${chevron} ${goalText.slice(0, 40)} — ${meta}`;

          return column({
            id: ids.SECTION,
            style: {
              ...this.style?.("goalSection"),
              "border-left": `3px solid ${statusColor}`,
            },
            content: [
              button({
                id: ids.STATUS,
                text: headerLabel,
                style: {
                  ...this.style?.("goalHeader"),
                  "text-align": "left",
                  "background": "none",
                  border: "none",
                  width: "100%",
                },
                callback: () => {
                  if (collapsedGoals.has(goal.id)) {
                    collapsedGoals.delete(goal.id);
                  } else {
                    collapsedGoals.add(goal.id);
                  }
                  const nowCollapsed = collapsedGoals.has(goal.id);
                  const newChevron = nowCollapsed ? "▶" : "▼";
                  api.v1.ui.updateParts([
                    {
                      id: ids.STATUS,
                      text: `${newChevron} ${goalText.slice(0, 40)} — ${meta}`,
                    },
                    {
                      id: ids.BEATS,
                      style: nowCollapsed ? { display: "none" } : { display: "flex" },
                    },
                  ]);
                },
              }),
              column({
                id: ids.BEATS,
                style: isCollapsed
                  ? { display: "none" }
                  : this.style?.("goalBody"),
                content: bodyContent,
              }),
            ],
          });
        });

        api.v1.ui.updateParts([
          { id: "cr-goal-sections", style: { display: "flex" }, content: sectionParts },
        ]);
      },
    );

    // Chain controls visibility
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        api.v1.ui.updateParts([
          {
            id: "cr-chain-row",
            style: phase === "chaining" ? { display: "flex" } : { display: "none" },
          },
          {
            id: CR.STREAM_TEXT,
            style: (phase === "chaining" || phase === "building")
              ? this.style?.("streamText")
              : this.style?.("hidden"),
          },
        ]);
      },
    );

    return column({
      id: "cr-solver-view",
      style: { gap: "8px" },
      content: [
        // Stream text
        text({
          id: CR.STREAM_TEXT,
          text: "",
          markdown: true,
          style: this.style?.("hidden"),
        }),

        // Chain controls
        row({
          id: "cr-chain-row",
          style: state.crucible.phase === "chaining"
            ? this.style?.("buttonRow")
            : this.style?.("hidden"),
          content: [
            button({
              text: "Step",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleChainRequested()),
            }),
            button({
              text: "Auto-Chain",
              style: this.style?.("btnPrimary"),
              callback: () => {
                dispatch(autoChainStarted());
                dispatch(crucibleChainRequested());
              },
            }),
          ],
        }),

        // Per-goal collapsible sections
        column({
          id: "cr-goal-sections",
          style: this.style?.("hidden"),
          content: [],
        }),
      ],
    });
  },
});
