import { defineComponent } from "nai-act";
import {
  RootState,
  CruciblePhase,
} from "../../../core/store/types";
import {
  crucibleCommitted,
  crucibleReset,
  crucibleGoalsRequested,
  crucibleStopRequested,
  goalsConfirmed,
  goalToggled,
  checkpointCleared,
  crucibleChainRequested,
  crucibleMergeRequested,
  autoChainStarted,
  beatRejected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { BudgetFeedback } from "../BudgetFeedback";
import {
  NAI_HEADER,
  NAI_WARNING,
  NAI_DARK_BACKGROUND,
  NAI_PARAGRAPH,
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

// --- Phase labels ---
const PHASE_LABELS: Record<CruciblePhase, string> = {
  idle: "Ready",
  goals: "Goal Selection",
  chaining: "Backward Chaining",
  merging: "World Merge",
  reviewing: "Review World",
  populating: "Populating DULFS",
};

export const CrucibleWindow = defineComponent<undefined, RootState>({
  id: () => CR.WINDOW_ROOT,

  styles: {
    root: {
      padding: "10px",
      gap: "8px",
    },
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    title: {
      "font-size": "1.1em",
      "font-weight": "bold",
      color: NAI_HEADER,
    },
    phaseTag: {
      "font-size": "0.75em",
      padding: "2px 8px",
      "border-radius": "10px",
      "background-color": "rgba(255,255,255,0.08)",
      color: NAI_PARAGRAPH,
    },
    statusText: {
      "font-size": "0.8em",
      opacity: "0.7",
      "min-height": "1.2em",
    },
    section: {
      gap: "4px",
    },
    sectionTitle: {
      "font-size": "0.85em",
      "font-weight": "bold",
      opacity: "0.9",
    },
    goalCard: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(245,243,194,0.5)",
      gap: "2px",
      cursor: "pointer",
    },
    goalCardDeselected: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.02)",
      "border-left": "3px solid rgba(128,128,128,0.3)",
      gap: "2px",
      cursor: "pointer",
      opacity: "0.5",
    },
    goalText: {
      "font-size": "0.85em",
    },
    goalStakes: {
      "font-size": "0.75em",
      opacity: "0.6",
    },
    goalTerminal: {
      "font-size": "0.75em",
      opacity: "0.7",
      "font-style": "italic",
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
    btnDanger: {
      padding: "5px 10px",
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    checkpointBox: {
      padding: "8px",
      "border-radius": "4px",
      "background-color": "rgba(255,147,147,0.1)",
      "border-left": "3px solid " + NAI_WARNING,
      gap: "4px",
    },
    checkpointText: {
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    hidden: { display: "none" },
    beatCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(120,144,156,0.5)",
      gap: "2px",
    },
    beatScene: {
      "font-size": "0.8em",
    },
    beatMeta: {
      "font-size": "0.7em",
      opacity: "0.6",
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
    elementItem: {
      "font-size": "0.8em",
      "padding-left": "8px",
      "border-left": "2px solid rgba(255,255,255,0.1)",
    },
    mergedCard: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(129,212,250,0.5)",
      gap: "2px",
    },
    mergedName: {
      "font-size": "0.85em",
      "font-weight": "bold",
    },
    mergedType: {
      "font-size": "0.7em",
      opacity: "0.6",
      "text-transform": "uppercase",
    },
    mergedDesc: {
      "font-size": "0.8em",
      opacity: "0.85",
    },
    mergedPurpose: {
      "font-size": "0.75em",
      opacity: "0.6",
      "font-style": "italic",
    },
    chainLabel: {
      "font-size": "0.8em",
      opacity: "0.8",
    },
    activeGoalTag: {
      "font-size": "0.7em",
      padding: "1px 6px",
      "border-radius": "8px",
      "background-color": STATUS_GENERATING,
      color: NAI_DARK_BACKGROUND,
    },
    emptyState: {
      "font-size": "0.85em",
      opacity: "0.4",
      "font-style": "italic",
      "text-align": "center",
      padding: "16px",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // --- Generation Buttons (with full budget/cancel/continue support) ---
    const { part: goalsBtnPart } = ctx.render(GenerationButton, {
      id: CR.GOALS_BTN,
      label: "Generate Goals",
      variant: "button",
      generateAction: crucibleGoalsRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        // Track goals by matching active request type
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleGoals") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleGoals");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleMerge",
    });

    const { part: budgetPart } = ctx.render(BudgetFeedback, { id: "cr-budget" });

    // --- Reactive UI updates ---

    // Phase display
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        api.v1.ui.updateParts([
          { id: CR.PHASE_TEXT, text: PHASE_LABELS[phase] || phase },
        ]);
      },
    );

    // Status text (active goal, chain progress, etc.)
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        activeGoalId: s.crucible.activeGoalId,
        goals: s.crucible.goals,
        chains: s.crucible.chains,
        autoChaining: s.crucible.autoChaining,
        activeType: s.runtime.activeRequest?.type,
      }),
      (slice) => {
        let statusText = "";
        if (slice.phase === "idle") {
          statusText = "Generate goals from your brainstorm to begin.";
        } else if (slice.phase === "goals") {
          const selected = slice.goals.filter((g) => g.selected).length;
          statusText = `${selected}/${slice.goals.length} goals selected. Confirm to begin chaining.`;
        } else if (slice.phase === "chaining") {
          const goal = slice.goals.find((g) => g.id === slice.activeGoalId);
          const chain = slice.activeGoalId ? slice.chains[slice.activeGoalId] : null;
          const beats = chain?.beats.length || 0;
          const open = chain?.openConstraints.length || 0;
          const goalName = goal?.goal?.slice(0, 40) || "...";
          const auto = slice.autoChaining ? " (auto)" : "";
          statusText = `Chaining: "${goalName}" — ${beats} beats, ${open} open constraints${auto}`;
        } else if (slice.phase === "merging") {
          statusText = "Merging world elements across goals...";
        } else if (slice.phase === "reviewing") {
          statusText = "Review the merged world. Commit to populate DULFS.";
        } else if (slice.phase === "populating") {
          statusText = "Elements exported to Story Engine.";
        }
        api.v1.ui.updateParts([{ id: CR.STATUS_TEXT, text: statusText }]);
      },
    );

    // Goals list
    useSelector(
      (s) => s.crucible.goals,
      (goals) => {
        if (goals.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.GOALS_LIST, style: this.style?.("hidden") },
          ]);
          return;
        }

        const goalParts = goals.map((goal) => {
          const ids = CR.goal(goal.id);
          return column({
            id: ids.ROOT,
            style: goal.selected
              ? this.style?.("goalCard")
              : this.style?.("goalCardDeselected"),
            content: [
              row({
                style: { "justify-content": "space-between", "align-items": "center" },
                content: [
                  text({ id: ids.TEXT, text: goal.goal, style: this.style?.("goalText") }),
                  button({
                    id: ids.TOGGLE,
                    text: goal.selected ? "✓" : "○",
                    style: { "font-size": "0.8em", padding: "2px 6px" },
                    callback: () => dispatch(goalToggled({ goalId: goal.id })),
                  }),
                ],
              }),
              text({
                text: `Stakes: ${goal.stakes}`,
                style: this.style?.("goalStakes"),
              }),
              text({
                text: `Terminal: ${goal.terminalCondition}`,
                style: this.style?.("goalTerminal"),
              }),
            ],
          });
        });

        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: { display: "flex" }, content: goalParts },
        ]);
      },
    );

    // Checkpoint display
    useSelector(
      (s) => s.crucible.checkpointReason,
      (reason) => {
        if (reason) {
          api.v1.ui.updateParts([
            { id: CR.CHECKPOINT_ROW, style: this.style?.("checkpointBox") },
            { id: CR.CHECKPOINT_TEXT, text: reason },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.CHECKPOINT_ROW, style: this.style?.("hidden") },
          ]);
        }
      },
    );

    // Beats display (for active chain)
    useSelector(
      (s) => {
        const { activeGoalId, chains } = s.crucible;
        const chain = activeGoalId ? chains[activeGoalId] : null;
        return {
          beats: chain?.beats || [],
          open: chain?.openConstraints || [],
          resolved: chain?.resolvedConstraints || [],
          elements: chain?.worldElements,
          complete: chain?.complete || false,
          activeGoalId,
        };
      },
      (slice) => {
        // Beats
        if (slice.beats.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.BEATS_LIST, style: this.style?.("hidden") },
          ]);
        } else {
          // Show beats newest-first (closest to goal)
          const beatParts = slice.beats.map((beat, i) =>
            column({
              style: this.style?.("beatCard"),
              content: [
                text({
                  text: `Beat ${i + 1}: ${beat.scene}`,
                  style: this.style?.("beatScene"),
                }),
                beat.location ? text({
                  text: `📍 ${beat.location}`,
                  style: this.style?.("beatMeta"),
                }) : text({ text: "" }),
                beat.conflictTension ? text({
                  text: `⚔️ ${beat.conflictTension}`,
                  style: this.style?.("beatMeta"),
                }) : text({ text: "" }),
              ],
            }),
          ).reverse();

          api.v1.ui.updateParts([
            { id: CR.BEATS_LIST, style: { display: "flex" }, content: beatParts },
          ]);
        }

        // Constraints
        const constraintParts = [
          ...slice.open.map((c) =>
            text({
              text: `○ ${c.description}`,
              style: this.style?.("constraintOpen"),
            }),
          ),
          ...slice.resolved.slice(-5).map((c) =>
            text({
              text: `● ${c.description} (${c.status === "groundState" ? "ground state" : "resolved"})`,
              style: this.style?.("constraintResolved"),
            }),
          ),
        ];
        if (constraintParts.length > 0) {
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_LIST, style: { display: "flex" }, content: constraintParts },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_LIST, style: this.style?.("hidden") },
          ]);
        }

        // World elements summary
        if (slice.elements) {
          const counts: string[] = [];
          if (slice.elements.characters.length) counts.push(`${slice.elements.characters.length} chars`);
          if (slice.elements.locations.length) counts.push(`${slice.elements.locations.length} locs`);
          if (slice.elements.factions.length) counts.push(`${slice.elements.factions.length} factions`);
          if (slice.elements.systems.length) counts.push(`${slice.elements.systems.length} systems`);
          if (slice.elements.situations.length) counts.push(`${slice.elements.situations.length} situations`);
          const summary = counts.length > 0 ? `Elements: ${counts.join(", ")}` : "";
          api.v1.ui.updateParts([
            {
              id: CR.ELEMENTS_LIST,
              text: summary,
              style: summary ? this.style?.("chainLabel") : this.style?.("hidden"),
            },
          ]);
        }
      },
    );

    // Merged world display
    useSelector(
      (s) => s.crucible.mergedWorld,
      (mergedWorld) => {
        if (!mergedWorld || mergedWorld.elements.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.MERGED_LIST, style: this.style?.("hidden") },
          ]);
          return;
        }

        const elementParts = mergedWorld.elements.map((el) =>
          column({
            style: this.style?.("mergedCard"),
            content: [
              row({
                style: { gap: "6px", "align-items": "center" },
                content: [
                  text({ text: el.name, style: this.style?.("mergedName") }),
                  text({ text: el.type, style: this.style?.("mergedType") }),
                ],
              }),
              text({ text: el.description, style: this.style?.("mergedDesc") }),
              ...Object.entries(el.goalPurposes).map(([goal, purpose]) =>
                text({
                  text: `→ ${goal.slice(0, 30)}: ${purpose}`,
                  style: this.style?.("mergedPurpose"),
                }),
              ),
            ],
          }),
        );

        api.v1.ui.updateParts([
          { id: CR.MERGED_LIST, style: { display: "flex" }, content: elementParts },
        ]);
      },
    );

    // Action buttons visibility by phase
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        hasGoals: s.crucible.goals.length > 0,
        hasSelectedGoals: s.crucible.goals.some((g) => g.selected),
        activeGoalId: s.crucible.activeGoalId,
        autoChaining: s.crucible.autoChaining,
        hasMergedWorld: s.crucible.mergedWorld !== null,
      }),
      (slice) => {
        const { phase } = slice;

        // Goals button: visible in idle
        api.v1.ui.updateParts([
          {
            id: `${CR.GOALS_BTN}`,
            style: phase === "idle" ? { display: "flex" } : { display: "none" },
          },
        ]);

        // Confirm Goals button
        api.v1.ui.updateParts([
          {
            id: "cr-confirm-goals-btn",
            style: phase === "goals" && slice.hasSelectedGoals
              ? this.style?.("btnPrimary")
              : this.style?.("hidden"),
          },
        ]);

        // Chain controls
        api.v1.ui.updateParts([
          {
            id: "cr-chain-row",
            style: phase === "chaining" ? { display: "flex" } : { display: "none" },
          },
        ]);

        // Commit button: visible in reviewing
        api.v1.ui.updateParts([
          {
            id: CR.COMMIT_BTN,
            style: phase === "reviewing" && slice.hasMergedWorld
              ? this.style?.("btnPrimary")
              : this.style?.("hidden"),
          },
        ]);

        // Stop button: visible during chaining/merging/goals generation
        api.v1.ui.updateParts([
          {
            id: CR.STOP_BTN,
            style: (phase === "chaining" || phase === "merging")
              ? this.style?.("btnDanger")
              : this.style?.("hidden"),
          },
        ]);
      },
    );

    // --- Build initial UI tree ---
    return column({
      id: CR.WINDOW_ROOT,
      style: this.style?.("root"),
      content: [
        // Header
        row({
          style: this.style?.("headerRow"),
          content: [
            text({ text: "Crucible", style: this.style?.("title") }),
            text({
              id: CR.PHASE_TEXT,
              text: PHASE_LABELS[state.crucible.phase],
              style: this.style?.("phaseTag"),
            }),
            button({
              id: CR.RESET_BTN,
              text: "Reset",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleReset()),
            }),
          ],
        }),

        // Status
        text({
          id: CR.STATUS_TEXT,
          text: state.crucible.phase === "idle"
            ? "Generate goals from your brainstorm to begin."
            : "",
          style: this.style?.("statusText"),
        }),

        // Budget feedback
        budgetPart,

        // Checkpoint alert
        column({
          id: CR.CHECKPOINT_ROW,
          style: state.crucible.checkpointReason
            ? this.style?.("checkpointBox")
            : this.style?.("hidden"),
          content: [
            text({
              id: CR.CHECKPOINT_TEXT,
              text: state.crucible.checkpointReason || "",
              style: this.style?.("checkpointText"),
            }),
            row({
              style: { gap: "6px" },
              content: [
                button({
                  text: "Continue",
                  style: this.style?.("btnPrimary"),
                  callback: () => dispatch(checkpointCleared()),
                }),
                button({
                  text: "Reject Beat",
                  style: this.style?.("btnDanger"),
                  callback: () => {
                    const s = ctx.getState();
                    if (s.crucible.activeGoalId) {
                      dispatch(beatRejected({ goalId: s.crucible.activeGoalId }));
                      dispatch(checkpointCleared());
                    }
                  },
                }),
              ],
            }),
          ],
        }),

        row({ style: { "border-top": "1px solid rgba(255,255,255,0.08)", "margin": "4px 0" }, content: [] }),

        // Goals Generation Button (with full state tracking)
        goalsBtnPart,

        // Confirm Goals button
        button({
          id: "cr-confirm-goals-btn",
          text: "Confirm Goals & Start Chaining",
          style: state.crucible.phase === "goals"
            ? this.style?.("btnPrimary")
            : this.style?.("hidden"),
          callback: () => dispatch(goalsConfirmed()),
        }),

        // Goals list (populated reactively)
        column({
          id: CR.GOALS_LIST,
          style: state.crucible.goals.length > 0
            ? this.style?.("section")
            : this.style?.("hidden"),
          content: [],
        }),

        // Chain controls row
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
            button({
              text: "Merge World",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleMergeRequested()),
            }),
          ],
        }),

        // Stop button
        button({
          id: CR.STOP_BTN,
          text: "Stop",
          style: this.style?.("hidden"),
          callback: () => dispatch(crucibleStopRequested()),
        }),

        // Beats list (populated reactively)
        column({
          id: CR.BEATS_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Constraints list
        column({
          id: CR.CONSTRAINTS_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Elements summary
        text({
          id: CR.ELEMENTS_LIST,
          text: "",
          style: this.style?.("hidden"),
        }),

        // Merged world list (populated reactively)
        column({
          id: CR.MERGED_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Commit button
        button({
          id: CR.COMMIT_BTN,
          text: "Commit to Story Engine",
          style: this.style?.("hidden"),
          callback: () => dispatch(crucibleCommitted()),
        }),
      ],
    });
  },
});
