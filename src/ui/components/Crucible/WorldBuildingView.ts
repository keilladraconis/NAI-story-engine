import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { parseTag } from "../../../core/utils/tag-parser";
import {
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

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
    streamText: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      opacity: "0.8",
      "min-height": "1.2em",
      "user-select": "text",
    },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;

    // Visibility + goal progress
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        goals: s.crucible.goals.filter((g) => g.selected),
        chains: s.crucible.chains,
        activeGoalId: s.crucible.activeGoalId,
      }),
      (slice) => {
        const visible = slice.phase === "chaining" || slice.phase === "building";
        if (!visible) {
          api.v1.ui.updateParts([
            { id: "cr-world-building-view", style: this.style?.("hidden") },
          ]);
          return;
        }

        // Build goal progress lines
        const progressParts = slice.goals.map((goal) => {
          const chain = slice.chains[goal.id];
          const goalName = parseTag(goal.text, "GOAL")?.slice(0, 50) || goal.text.slice(0, 50) || "...";
          const isActive = goal.id === slice.activeGoalId;
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
            style: { ...this.style?.("goalLine"), color },
          });
        });

        api.v1.ui.updateParts([
          { id: "cr-world-building-view", style: this.style?.("root") },
          { id: "cr-goal-progress", style: this.style?.("goalProgress"), content: progressParts },
        ]);
      },
    );

    // Stream text visibility by phase
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        const visible = phase === "chaining" || phase === "building";
        api.v1.ui.updateParts([
          {
            id: CR.STREAM_TEXT,
            style: visible ? this.style?.("streamText") : this.style?.("hidden"),
          },
        ]);
      },
    );

    return column({
      id: "cr-world-building-view",
      style: this.style?.("hidden"),
      content: [
        column({
          id: "cr-goal-progress",
          style: this.style?.("goalProgress"),
          content: [],
        }),
        text({
          id: CR.STREAM_TEXT,
          text: "",
          markdown: true,
          style: this.style?.("hidden"),
        }),
      ],
    });
  },
});
