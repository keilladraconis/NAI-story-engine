import { defineComponent } from "nai-act";
import { mergeStyles } from "nai-act";
import { RootState, CrucibleGoal, CrucibleChain, Constraint, DirectorGuidance } from "../../../core/store/types";
import {
  constraintMarkedGroundState,
  constraintAdded,
  constraintRemoved,
  constraintResolved,
  constraintUnresolved,
  directorGuidanceSet,
} from "../../../core/store/slices/crucible";
import { parseTag } from "../../../core/utils/tag-parser";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import {
  NAI_HEADER,
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, column, row, button, textInput } = api.v1.ui.part;
const CR = IDS.CRUCIBLE;

/** Storage key for Director guidance editable text. */
const DIRECTOR_STORAGE_KEY = "cr-director-text";

/** Format Director guidance for display/editing. */
function formatDirectorDisplay(guidance: DirectorGuidance | null): string {
  if (!guidance) return "";
  const parts: string[] = [];
  if (guidance.solver) parts.push(`[FOR SOLVER] ${guidance.solver}`);
  if (guidance.builder) parts.push(`[FOR BUILDER] ${guidance.builder}`);
  return parts.join("\n");
}

export const WorldBuildingView = defineComponent<undefined, RootState>({
  id: () => "cr-world-building-view",

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
    },
    sectionTitle: {
      "font-size": "0.75em",
      "font-weight": "bold",
      "text-transform": "uppercase",
      opacity: "0.6",
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
    directorRoot: {
      gap: "4px",
      padding: "6px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(245,243,194,0.4)",
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
    constraintBtn: {
      "font-size": "0.7em",
      padding: "1px 4px",
      "flex-shrink": "0",
    },
    addRow: {
      gap: "4px",
      "align-items": "center",
      "margin-top": "2px",
    },
    addInput: {
      flex: "1",
      "font-size": "0.8em",
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
      gap: "4px",
      "align-items": "center",
    },
    resolvedText: {
      flex: "1",
    },
    resolvedList: {
      gap: "1px",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const { goals, chains, activeGoalId, directorGuidance } = state.crucible;
    const visible = activeGoalId != null && chains[activeGoalId] != null;
    const selectedGoals = goals.filter((g) => g.selected);

    // --- Goal progress lines ---

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

    // --- Director guidance section ---

    // Seed storyStorage for Director editable text
    const directorText = formatDirectorDisplay(directorGuidance);
    api.v1.storyStorage.set(DIRECTOR_STORAGE_KEY, directorText);

    const { part: directorEditable } = ctx.render(EditableText, {
      id: CR.DIRECTOR_TEXT,
      storageKey: DIRECTOR_STORAGE_KEY,
      placeholder: "Director guidance will appear here after a few beats...",
      initialDisplay: directorText
        ? directorText.replace(/\n/g, "  \n").replace(/</g, "\\<")
        : "_No guidance yet \u2014 the Director runs after 3 beats._",
      label: "\uD83C\uDFAC Director",
      onSave: (raw: string) => {
        const solver = parseTag(raw, "FOR SOLVER") || "";
        const builder = parseTag(raw, "FOR BUILDER") || "";
        const currentState = ctx.getState();
        const chain = currentState.crucible.activeGoalId
          ? currentState.crucible.chains[currentState.crucible.activeGoalId]
          : null;
        dispatch(directorGuidanceSet({
          solver: solver.trim(),
          builder: builder.trim(),
          atBeatIndex: chain?.beats.length ?? 0,
        }));
      },
    });

    // --- Constraint controls ---

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
            text: "Resolve",
            style: this.style?.("constraintBtn"),
            callback: () => dispatch(constraintResolved({ goalId, constraintId: c.id })),
          }),
          button({
            text: "Ground",
            style: this.style?.("constraintBtn"),
            callback: () => dispatch(constraintMarkedGroundState({ goalId, constraintId: c.id })),
          }),
          button({
            text: "\u2715",
            style: this.style?.("constraintBtn"),
            callback: () => dispatch(constraintRemoved({ goalId, constraintId: c.id })),
          }),
        ],
      });
    };

    const buildResolvedLine = (c: Constraint, goalId: string): UIPart => {
      const icon = c.status === "groundState" ? "\u26F0\uFE0F" : "\u2705";
      const label = c.status === "groundState"
        ? "ground state"
        : `Beat ${c.sourceBeatIndex + 1}`;
      return row({
        id: `cr-cst-r-${c.shortId}`,
        style: this.style?.("resolvedLine"),
        content: [
          text({
            text: `${icon} ${c.shortId}: ${c.description} \u2192 ${label}`,
            style: this.style?.("resolvedText"),
          }),
          button({
            text: "Reopen",
            style: this.style?.("constraintBtn"),
            callback: () => dispatch(constraintUnresolved({ goalId, constraintId: c.id })),
          }),
          button({
            text: "\u2715",
            style: this.style?.("constraintBtn"),
            callback: () => dispatch(constraintRemoved({ goalId, constraintId: c.id })),
          }),
        ],
      });
    };

    const buildAddConstraintRow = (goalId: string): UIPart => {
      return row({
        id: CR.CONSTRAINT_ADD_BTN,
        style: this.style?.("addRow"),
        content: [
          textInput({
            id: CR.CONSTRAINT_INPUT,
            initialValue: "",
            placeholder: "New constraint...",
            storageKey: `story:cr-constraint-input`,
            style: this.style?.("addInput"),
          }),
          button({
            text: "Add",
            style: this.style?.("constraintBtn"),
            callback: async () => {
              const desc = String(
                (await api.v1.storyStorage.get("cr-constraint-input")) || "",
              ).trim();
              if (!desc) return;
              dispatch(constraintAdded({ goalId, id: api.v1.uuid(), description: desc }));
              await api.v1.storyStorage.set("cr-constraint-input", "");
              // Clear the input visually by updating the part
              api.v1.ui.updateParts([
                { id: CR.CONSTRAINT_INPUT, initialValue: "" },
              ]);
            },
          }),
        ],
      });
    };

    // Toggle resolved list visibility
    let resolvedExpanded = false;

    const buildConstraintTracker = (
      chain: CrucibleChain,
      goalId: string,
    ): UIPart[] => {
      const parts: UIPart[] = [
        text({
          text: `Constraints \u2014 ${chain.openConstraints.length} open, ${chain.resolvedConstraints.length} resolved`,
          style: mergeStyles(this.style?.("sectionTitle"), { color: NAI_HEADER }),
        }),
      ];

      if (chain.openConstraints.length > 0) {
        parts.push(
          ...chain.openConstraints.map((c) => buildOpenConstraintRow(c, goalId)),
        );
      }

      // Add constraint input
      parts.push(buildAddConstraintRow(goalId));

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
            content: chain.resolvedConstraints.map((c) => buildResolvedLine(c, goalId)),
          }),
        );
      }

      return parts;
    };

    // --- Initial render ---

    const initialProgressParts = visible
      ? selectedGoals.map((g) => buildProgressLine(g, chains[g.id], activeGoalId))
      : [];

    const activeChain = activeGoalId ? chains[activeGoalId] : undefined;
    const initialConstraintParts = visible && activeGoalId && activeChain
      ? buildConstraintTracker(activeChain, activeGoalId)
      : [];

    const hasDirector = directorGuidance != null;

    // --- Reactive subscriptions ---

    // Goal progress + constraints
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

    // Director guidance reactivity
    useSelector(
      (s) => s.crucible.directorGuidance,
      (guidance) => {
        const dirText = formatDirectorDisplay(guidance);
        api.v1.storyStorage.set(DIRECTOR_STORAGE_KEY, dirText);

        const display = dirText
          ? dirText.replace(/\n/g, "  \n").replace(/</g, "\\<")
          : "_No guidance yet \u2014 the Director runs after 3 beats._";
        api.v1.ui.updateParts([
          { id: `${CR.DIRECTOR_TEXT}-view`, text: display },
          { id: CR.DIRECTOR_ROOT, style: this.style?.("directorRoot", !guidance && "hidden") },
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
        column({
          id: CR.DIRECTOR_ROOT,
          style: this.style?.("directorRoot", !hasDirector && "hidden"),
          content: [directorEditable],
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
