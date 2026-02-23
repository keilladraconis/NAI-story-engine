import { defineComponent } from "nai-act";
import { RootState, CruciblePhase } from "../../../core/store/types";
import {
  crucibleReset,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { BudgetFeedback } from "../BudgetFeedback";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import {
  NAI_HEADER,
} from "../../colors";

const { text, row, column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

const PHASE_STATUS: Record<CruciblePhase, string> = {
  direction: "",
  goals: "Star goals ★ then click Build World",
  building: "Building world...",
  review: "Review — or star more goals and rebuild",
  merged: "World merged to DULFS",
  expanding: "Expanding element...",
};

const CRUCIBLE_GEN_TYPES = new Set([
  "crucibleDirection", "crucibleGoal",
  "crucibleStructuralGoal", "cruciblePrereqs", "crucibleElements", "crucibleExpansion",
]);

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
      "font-size": "0.85em",
      opacity: "0.6",
      height: "1.2em",
    },
    tickerText: {
      "font-size": "0.8em",
      opacity: "0.45",
      "white-space": "nowrap",
      overflow: "hidden",
      "text-overflow": "ellipsis",
      height: "1.1em",
    },
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    const { part: budgetPart } = ctx.render(BudgetFeedback, { id: "cr-budget" });

    const { part: resetBtn } = ctx.render(ButtonWithConfirmation, {
      id: CR.RESET_BTN,
      label: "Clear",
      confirmLabel: "Clear?",
      buttonStyle: { padding: "4px 8px", opacity: 0.7 },
      onConfirm: () => {
        dispatch(crucibleReset());
      },
    });

    // Phase-aware status text
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        const statusStr = PHASE_STATUS[phase] || "";
        api.v1.ui.updateParts([
          { id: CR.STATUS_TEXT, text: statusStr, style: statusStr ? this.style?.("statusText") : this.style?.("hidden") },
        ]);
      },
    );

    // Show/hide ticker based on whether a Crucible generation is active; clear text when idle
    useSelector(
      (s) => s.runtime.activeRequest?.type,
      (activeType) => {
        const active = !!(activeType && CRUCIBLE_GEN_TYPES.has(activeType));
        if (!active) {
          api.v1.ui.updateParts([
            { id: CR.TICKER_TEXT, text: "", style: this.style?.("hidden") },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.TICKER_TEXT, style: this.style?.("tickerText") },
          ]);
        }
      },
    );

    const initialStatus = PHASE_STATUS[state.crucible.phase] || "";
    const initialActiveType = state.runtime.activeRequest?.type;
    const tickerVisible = !!(initialActiveType && CRUCIBLE_GEN_TYPES.has(initialActiveType));

    return column({
      id: "cr-header",
      style: { gap: "8px", "flex-shrink": "0", padding: "10px 10px 0" },
      content: [
        row({
          style: this.style?.("headerRow"),
          content: [
            text({ text: "Crucible", style: this.style?.("title") }),
            resetBtn,
          ],
        }),
        budgetPart,
        text({
          id: CR.STATUS_TEXT,
          text: initialStatus,
          markdown: true,
          style: initialStatus ? this.style?.("statusText") : this.style?.("hidden"),
        }),
        text({
          id: CR.TICKER_TEXT,
          text: "",
          style: tickerVisible ? this.style?.("tickerText") : this.style?.("hidden"),
        }),
      ],
    });
  },
});
