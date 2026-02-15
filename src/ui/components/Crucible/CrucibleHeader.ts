import { defineComponent } from "nai-act";
import { RootState, CruciblePhase } from "../../../core/store/types";
import {
  crucibleReset,
  crucibleStopRequested,
  checkpointCleared,
  beatRejected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { BudgetFeedback } from "../BudgetFeedback";
import { parseTag } from "../../../core/utils/tag-parser";
import {
  NAI_HEADER,
  NAI_WARNING,
  NAI_DARK_BACKGROUND,
  NAI_PARAGRAPH,
} from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

const PHASE_LABELS: Record<CruciblePhase, string> = {
  idle: "Ready",
  goals: "Goal Selection",
  chaining: "Solver",
  building: "Builder",
};

function computeStatusText(slice: {
  phase: CruciblePhase;
  activeGoalId: string | null;
  goals: RootState["crucible"]["goals"];
  chains: RootState["crucible"]["chains"];
  autoChaining: boolean;
}): string {
  if (slice.phase === "idle") {
    return "Write or derive intent, then generate goals.";
  } else if (slice.phase === "goals") {
    const selected = slice.goals.filter((g) => g.selected).length;
    return `${selected}/${slice.goals.length} goals selected.`;
  } else if (slice.phase === "chaining") {
    const goal = slice.goals.find((g) => g.id === slice.activeGoalId);
    const chain = slice.activeGoalId ? slice.chains[slice.activeGoalId] : null;
    const beats = chain?.beats.length || 0;
    const open = chain?.openConstraints.length || 0;
    const goalText = goal ? (parseTag(goal.text, "GOAL") || goal.text.slice(0, 40)) : "...";
    const auto = slice.autoChaining ? " (auto)" : "";
    return `Chaining: "${goalText.slice(0, 40)}" \u2014 ${beats} beats, ${open} open${auto}`;
  }
  return "";
}

export const CrucibleHeader = defineComponent<undefined, RootState>({
  id: () => "cr-header",

  styles: {
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
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    const { part: budgetPart } = ctx.render(BudgetFeedback, { id: "cr-budget" });

    // Phase display
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        api.v1.ui.updateParts([
          { id: CR.PHASE_TEXT, text: PHASE_LABELS[phase] || phase },
        ]);
      },
    );

    // Status text
    useSelector(
      (s: RootState) => ({
        phase: s.crucible.phase,
        activeGoalId: s.crucible.activeGoalId,
        goals: s.crucible.goals,
        chains: s.crucible.chains,
        autoChaining: s.crucible.autoChaining,
      }),
      (slice) => {
        api.v1.ui.updateParts([{ id: CR.STATUS_TEXT, text: computeStatusText(slice) }]);
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

    // Stop button visibility
    useSelector(
      (s) => s.runtime.activeRequest !== null,
      (isGenerating) => {
        api.v1.ui.updateParts([
          {
            id: CR.STOP_BTN,
            style: isGenerating
              ? this.style?.("btnDanger")
              : this.style?.("hidden"),
          },
        ]);
      },
    );

    return column({
      id: "cr-header",
      style: { gap: "8px", "flex-shrink": "0", padding: "10px 10px 0" },
      content: [
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
        text({
          id: CR.STATUS_TEXT,
          text: "Write or generate intent, then generate goals.",
          style: this.style?.("statusText"),
        }),
        budgetPart,
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
        button({
          id: CR.STOP_BTN,
          text: "Stop",
          style: this.style?.("hidden"),
          callback: () => dispatch(crucibleStopRequested()),
        }),
      ],
    });
  },
});
