import { defineComponent } from "nai-act";
import { mergeStyles } from "nai-act";
import { RootState, CrucibleGoal, CrucibleChain, Constraint } from "../../../core/store/types";
import { constraintMarkedGroundState } from "../../../core/store/slices/crucible";
import { parseTag } from "../../../core/utils/tag-parser";
import { IDS } from "../../framework/ids";
import {
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, column, row, button } = api.v1.ui.part;
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
    constraintsRoot: {
      gap: "4px",
      "margin-top": "4px",
    },
    constraintLine: {
      "font-size": "0.8em",
      gap: "4px",
      "align-items": "center",
    },
    constraintText: {
      flex: "1",
      overflow: "hidden",
      "text-overflow": "ellipsis",
      "white-space": "nowrap",
    },
    groundBtn: {
      "font-size": "0.7em",
      padding: "1px 4px",
      "flex-shrink": "0",
    },
    resolvedHeader: {
      "font-size": "0.75em",
      opacity: "0.6",
      cursor: "pointer",
      background: "none",
      border: "none",
      padding: "0",
      color: "inherit",
      "text-align": "left",
    },
    resolvedLine: {
      "font-size": "0.75em",
      opacity: "0.5",
    },
    resolvedList: {
      gap: "1px",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
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

    const buildOpenConstraintRow = (c: Constraint, goalId: string): UIPart => {
      return row({
        id: `cr-cst-${c.shortId}`,
        style: this.style?.("constraintLine"),
        content: [
          text({
            text: `\u2B55 ${c.shortId}: ${c.description}`,
            style: this.style?.("constraintText"),
          }),
          button({
            id: `cr-cst-${c.shortId}-ground`,
            text: "Ground",
            style: this.style?.("groundBtn"),
            callback: () => dispatch(constraintMarkedGroundState({ goalId, constraintId: c.id })),
          }),
        ],
      });
    };

    const buildResolvedLine = (c: Constraint): UIPart => {
      const icon = c.status === "groundState" ? "\u26F0\uFE0F" : "\u2705";
      const label = c.status === "groundState"
        ? "ground state"
        : `Beat ${c.sourceBeatIndex + 1}`;
      return text({
        text: `${icon} ${c.shortId}: ${c.description} \u2192 ${label}`,
        style: this.style?.("resolvedLine"),
      });
    };

    const buildConstraintTracker = (
      chain: CrucibleChain,
      goalId: string,
    ): UIPart[] => {
      const parts: UIPart[] = [];

      if (chain.openConstraints.length > 0) {
        parts.push(
          ...chain.openConstraints.map((c) => buildOpenConstraintRow(c, goalId)),
        );
      }

      if (chain.resolvedConstraints.length > 0) {
        parts.push(
          button({
            id: `${CR.RESOLVED_LIST}-header`,
            text: `Resolved (${chain.resolvedConstraints.length}) ${resolvedExpanded ? "\u25BE" : "\u25B8"}`,
            style: this.style?.("resolvedHeader"),
            callback: () => {
              resolvedExpanded = !resolvedExpanded;
              api.v1.ui.updateParts([
                {
                  id: CR.RESOLVED_LIST,
                  style: mergeStyles(
                    this.style?.("resolvedList"),
                    resolvedExpanded ? undefined : { display: "none" },
                  ),
                },
                {
                  id: `${CR.RESOLVED_LIST}-header`,
                  text: `Resolved (${chain.resolvedConstraints.length}) ${resolvedExpanded ? "\u25BE" : "\u25B8"}`,
                },
              ]);
            },
          }),
          column({
            id: CR.RESOLVED_LIST,
            style: mergeStyles(this.style?.("resolvedList"), resolvedExpanded ? undefined : { display: "none" }),
            content: chain.resolvedConstraints.map(buildResolvedLine),
          }),
        );
      }

      return parts;
    };

    const initialProgressParts = visible
      ? selectedGoals.map((g) => buildProgressLine(g, chains[g.id], activeGoalId))
      : [];

    const activeChain = activeGoalId ? chains[activeGoalId] : undefined;
    const initialConstraintParts = visible && activeGoalId && activeChain
      ? buildConstraintTracker(activeChain, activeGoalId)
      : [];

    // Toggle resolved list visibility
    let resolvedExpanded = false;

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

        const chain = slice.activeGoalId ? slice.chains[slice.activeGoalId] : undefined;
        if (chain && slice.activeGoalId) {
          const constraintParts = buildConstraintTracker(chain, slice.activeGoalId);
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_ROOT, style: this.style?.("constraintsRoot"), content: constraintParts },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_ROOT, content: [] },
          ]);
        }
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
        column({
          id: CR.CONSTRAINTS_ROOT,
          style: this.style?.("constraintsRoot"),
          content: initialConstraintParts,
        }),
      ],
    });
  },
});
