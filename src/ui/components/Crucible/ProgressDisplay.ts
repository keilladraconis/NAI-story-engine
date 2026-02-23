import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { crucibleStopRequested } from "../../../core/store/slices/crucible";

const { text, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const ProgressDisplay = defineComponent<undefined, RootState>({
  id: () => CR.PROGRESS_ROOT,

  styles: {
    root: {
      gap: "8px",
      padding: "12px",
      "border-radius": "6px",
      "background-color": "rgba(255,255,255,0.03)",
    },
    progressText: {
      "font-size": "0.9em",
      opacity: "0.8",
    },
    stepList: {
      gap: "4px",
    },
    step: {
      "font-size": "0.85em",
      opacity: "0.7",
    },
    stopBtn: {
      padding: "5px 10px",
      "font-size": "0.8em",
      opacity: "0.7",
      "align-self": "flex-start",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    // Reactive step checklist
    useSelector(
      (s) => ({
        sgCount: s.crucible.structuralGoals.length,
        prereqCount: s.crucible.prerequisites.length,
        elementCount: s.crucible.elements.length,
        starredCount: s.crucible.goals.filter((g) => g.starred).length,
      }),
      (data) => {
        const steps: string[] = [];
        steps.push("✓ Direction captured");

        if (data.sgCount >= data.starredCount && data.starredCount > 0) {
          steps.push(`✓ ${data.sgCount} structural goal${data.sgCount !== 1 ? "s" : ""} derived`);
        } else if (data.sgCount > 0) {
          steps.push(`⟳ Deriving structural goals... (${data.sgCount}/${data.starredCount})`);
        } else {
          steps.push("⟳ Finding the heart of your story...");
        }

        if (data.prereqCount > 0) {
          steps.push(`✓ ${data.prereqCount} prerequisites found`);
        } else if (data.sgCount >= data.starredCount && data.starredCount > 0) {
          steps.push("⟳ Deriving what must be true...");
        }

        if (data.elementCount > 0) {
          steps.push(`✓ ${data.elementCount} world elements created`);
        } else if (data.prereqCount > 0) {
          steps.push("⟳ Building your world...");
        }

        const stepsText = steps.join("  \n");
        api.v1.ui.updateParts([{ id: "cr-progress-steps", text: stepsText }]);
      },
    );

    const initialSteps = "✓ Direction captured  \n⟳ Finding the heart of your story...";

    return column({
      id: CR.PROGRESS_ROOT,
      style: this.style?.("root"),
      content: [
        text({ text: "Building World", style: { "font-weight": "bold", "font-size": "0.9em" } }),
        text({
          id: "cr-progress-steps",
          text: initialSteps,
          markdown: true,
          style: this.style?.("progressText"),
        }),
        button({
          id: "cr-stop-build-btn",
          text: "Stop",
          style: this.style?.("stopBtn"),
          callback: () => dispatch(crucibleStopRequested()),
        }),
      ],
    });
  },
});
