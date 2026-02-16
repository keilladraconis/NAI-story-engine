import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  crucibleReset,
  crucibleStopRequested,
  checkpointCleared,
  beatRejected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { BudgetFeedback } from "../BudgetFeedback";
import {
  NAI_HEADER,
  NAI_WARNING,
  NAI_DARK_BACKGROUND,
} from "../../colors";

const { text, row, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

function computeStatusText(slice: {
  phase: RootState["crucible"]["phase"];
  activeGoalId: string | null;
  goals: RootState["crucible"]["goals"];
  chains: RootState["crucible"]["chains"];
  autoChaining: boolean;
}): string {
  if (slice.phase === "idle") {
    return "Describe your story's direction, or let the AI derive it from your brainstorm.";
  } else if (slice.phase === "goals") {
    return "Review the generated goals. Star the ones you want to explore.";
  } else if (slice.phase === "chaining" || slice.phase === "building") {
    const starredCount = slice.goals.filter((g) => g.selected).length;
    if (slice.autoChaining) {
      return `Building your world from ${starredCount} goal${starredCount !== 1 ? "s" : ""}...`;
    }
    return "World building paused.";
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
          text: "Describe your story's direction, or let the AI derive it from your brainstorm.",
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
                  text: "Step Back",
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
