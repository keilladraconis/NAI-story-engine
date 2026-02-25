import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { CrucibleHeader } from "./CrucibleHeader";
import { IntentSection } from "./IntentSection";
import { GoalsSection } from "./GoalsSection";
import { ProgressDisplay } from "./ProgressDisplay";
import { ReviewView } from "./ReviewView";

const { column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const CruciblePanel = defineComponent<undefined, RootState>({
  id: () => CR.WINDOW_ROOT,

  styles: {
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;
    const state = ctx.getState();

    const { part: headerPart } = ctx.render(CrucibleHeader, undefined);
    const { part: intentPart } = ctx.render(IntentSection, undefined);
    const { part: goalsPart } = ctx.render(GoalsSection, undefined);
    const { part: progressPart } = ctx.render(ProgressDisplay, undefined);
    const { part: reviewPart } = ctx.render(ReviewView, undefined);

    // React to phase changes — show/hide pipeline sections
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        const showProgress = phase === "building";
        const showReview = phase === "review";

        api.v1.ui.updateParts([
          { id: "cr-progress-wrap", style: showProgress ? this.style?.("visible") : this.style?.("hidden") },
          { id: "cr-review-wrap", style: showReview ? this.style?.("visible") : this.style?.("hidden") },
        ]);
      },
    );

    const phase = state.crucible.phase;
    const showProgress = phase === "building";
    const showReview = phase === "review";

    return column({
      id: CR.WINDOW_ROOT,
      style: { height: "100%", overflow: "hidden" },
      content: [
        headerPart,
        column({
          id: "cr-body",
          style: { flex: "1", overflow: "auto", gap: "8px", padding: "0 10px 10px", "justify-content": "flex-start" },
          content: [
            column({ id: "cr-intent-wrap", style: {}, content: [intentPart] }),
            column({ id: "cr-goals-wrap", style: {}, content: [goalsPart] }),
            column({ id: "cr-progress-wrap", style: showProgress ? {} : this.style?.("hidden"), content: [progressPart] }),
            column({ id: "cr-review-wrap", style: showReview ? {} : this.style?.("hidden"), content: [reviewPart] }),
          ],
        }),
      ],
    });
  },
});
