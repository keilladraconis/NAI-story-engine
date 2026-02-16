import { defineComponent } from "nai-act";
import { mergeStyles } from "nai-act";
import { RootState, CrucibleGoal, CrucibleChain } from "../../../core/store/types";
import { parseTag } from "../../../core/utils/tag-parser";
import {
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, column } = api.v1.ui.part;

export const WorldBuildingView = defineComponent<undefined, RootState>({
  id: () => "cr-world-building-view",

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
    },
    goalProgress: {
      gap: "2px",
    },
    goalLine: {
      "font-size": "0.8em",
      "white-space": "nowrap",
      overflow: "hidden",
      "text-overflow": "ellipsis",
    },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;
    const state = ctx.getState();
    const { goals, chains, activeGoalId } = state.crucible;
    const visible = activeGoalId != null && chains[activeGoalId] != null;
    const selectedGoals = goals.filter((g) => g.selected);

    const buildProgressLine = (
      goal: CrucibleGoal,
      chain: CrucibleChain | undefined,
      currentActiveGoalId: string | null,
    ): UIPart => {
      const goalName = parseTag(goal.text, "GOAL")?.slice(0, 50) || goal.text.slice(0, 50) || "...";
      const isActive = goal.id === currentActiveGoalId;
      const isComplete = chain?.complete || false;

      let icon: string;
      let color: string;
      if (isComplete) {
        icon = "\u2705";
        color = STATUS_COMPLETE;
      } else if (isActive) {
        icon = "\uD83C\uDFAF";
        color = STATUS_GENERATING;
      } else {
        icon = "\u23F3";
        color = "inherit";
      }

      const suffix = isComplete ? "complete" : isActive ? "building..." : "waiting";

      return text({
        text: `${icon} ${goalName} \u2014 ${suffix}`,
        style: mergeStyles(this.style?.("goalLine"), { color }),
      });
    };

    const initialProgressParts = visible
      ? selectedGoals.map((g) => buildProgressLine(g, chains[g.id], activeGoalId))
      : [];

    useSelector(
      (s) => ({
        goals: s.crucible.goals.filter((g) => g.selected),
        chains: s.crucible.chains,
        activeGoalId: s.crucible.activeGoalId,
      }),
      (slice) => {
        const vis = slice.activeGoalId != null && slice.chains[slice.activeGoalId] != null;
        api.v1.ui.updateParts([
          { id: "cr-world-building-view", style: this.style?.("root", !vis && "hidden") },
        ]);
        if (!vis) return;

        const progressParts = slice.goals.map((g) =>
          buildProgressLine(g, slice.chains[g.id], slice.activeGoalId),
        );

        api.v1.ui.updateParts([
          { id: "cr-goal-progress", style: this.style?.("goalProgress"), content: progressParts },
        ]);
      },
    );

    return column({
      id: "cr-world-building-view",
      style: this.style?.("root", !visible && "hidden"),
      content: [
        column({
          id: "cr-goal-progress",
          style: this.style?.("goalProgress"),
          content: initialProgressParts,
        }),
      ],
    });
  },
});
