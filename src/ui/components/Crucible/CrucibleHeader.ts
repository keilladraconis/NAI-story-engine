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
  tensions: "Generate tensions then click Build World",
  building: "Building world — run passes, then Merge",
};

const CRUCIBLE_GEN_TYPES = new Set([
  "crucibleShape", "crucibleDirection",
  "crucibleTension", "crucibleBuildPass",
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
    const { dispatch } = ctx;

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
          markdown: true,
          ...ctx.bindPart(
            CR.STATUS_TEXT,
            (s) => s.crucible.phase,
            (phase) => {
              const statusStr = PHASE_STATUS[phase] || "";
              return { text: statusStr, style: statusStr ? this.style?.("statusText") : this.style?.("hidden") };
            },
          ),
        }),
        text({
          id: CR.TICKER_TEXT,
          text: "",
          ...ctx.bindPart(
            CR.TICKER_TEXT,
            (s) => s.runtime.activeRequest?.type,
            (activeType) => {
              const active = !!(activeType && CRUCIBLE_GEN_TYPES.has(activeType));
              return active
                ? { style: this.style?.("tickerText") }
                : { text: "", style: this.style?.("hidden") };
            },
          ),
        }),
      ],
    });
  },
});
