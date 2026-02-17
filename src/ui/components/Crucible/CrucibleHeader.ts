import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
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
    streamText: {
      "font-size": "0.85em",
      opacity: "0.6",
      overflow: "hidden",
      "white-space": "nowrap",
      "text-overflow": "ellipsis",
      height: "1.2em",
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

    // Stream text visibility: show when autoChaining or has an active chain
    useSelector(
      (s) => ({
        autoChaining: s.crucible.autoChaining,
        hasActiveChain: s.crucible.activeGoalId != null && s.crucible.chains[s.crucible.activeGoalId] != null,
      }),
      (slice) => {
        const vis = slice.autoChaining || slice.hasActiveChain;
        api.v1.ui.updateParts([
          { id: CR.STREAM_TEXT, style: this.style?.("streamText", !vis && "hidden") },
        ]);
      },
    );

    const hasActiveChain = state.crucible.activeGoalId != null && state.crucible.chains[state.crucible.activeGoalId] != null;
    const streamVis = state.crucible.autoChaining || hasActiveChain;

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
          id: CR.STREAM_TEXT,
          text: "",
          markdown: true,
          style: this.style?.("streamText", !streamVis && "hidden"),
        }),
      ],
    });
  },
});
