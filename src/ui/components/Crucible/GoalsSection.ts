import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  crucibleGoalsRequested,
  goalAdded,
  goalsCleared,
  goalsConfirmed,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GoalCard } from "./GoalCard";
import { formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import {
  NAI_HEADER,
  NAI_WARNING,
  NAI_DARK_BACKGROUND,
} from "../../colors";

const { text, row, column, button, collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const GoalsSection = defineComponent<undefined, RootState>({
  id: () => "cr-goals-section",

  styles: {
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    sectionTitle: {
      "font-size": "0.85em",
      "font-weight": "bold",
      opacity: "0.9",
    },
    divider: {
      "border-top": "1px solid rgba(255,255,255,0.08)",
      margin: "4px 0",
    },
    section: {
      gap: "4px",
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
    starHint: {
      "font-size": "0.8em",
      opacity: "0.6",
    },
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const { phase, goals } = state.crucible;
    const preChaining = phase === "idle" || phase === "goals";
    const hasGoals = goals.length > 0;
    const hasSelectedGoals = goals.some((g) => g.selected);
    const isGenerating = state.runtime.activeRequest !== null;

    const { part: goalsBtnPart } = ctx.render(GenerationButton, {
      id: CR.GOALS_BTN,
      label: "Goals",
      variant: "button",
      generateAction: crucibleGoalsRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleGoal") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleGoal");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleBuild" || proj.activeType === "crucibleIntent",
    });

    const { part: clearGoalsPart } = ctx.render(ButtonWithConfirmation, {
      id: CR.CLEAR_GOALS_BTN,
      label: "",
      iconId: "trash",
      confirmLabel: "Clear all goals?",
      buttonStyle: this.style?.("btnDanger"),
      onConfirm: () => dispatch(goalsCleared()),
    });

    // Cache rendered GoalCard parts per goal
    const goalEditables = new Map<string, UIPart>();

    // Build initial GoalCards from current state
    for (const goal of goals) {
      const { part } = ctx.render(GoalCard, {
        goalId: goal.id,
        selected: goal.selected,
      });
      goalEditables.set(goal.id, part);
      if (goal.text) {
        api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
      }
    }

    const initialGoalParts = goals.map((g) => goalEditables.get(g.id)!);

    const rebuildGoalsList = (currentGoals: typeof state.crucible.goals): void => {
      if (currentGoals.length === 0) {
        goalEditables.clear();
        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: this.style?.("hidden") },
        ]);
        return;
      }

      // Render GoalCard for new goals, clean up removed ones
      const currentIds = new Set(currentGoals.map((g) => g.id));
      for (const [id] of goalEditables) {
        if (!currentIds.has(id)) goalEditables.delete(id);
      }
      for (const goal of currentGoals) {
        if (!goalEditables.has(goal.id)) {
          const { part } = ctx.render(GoalCard, {
            goalId: goal.id,
            selected: goal.selected,
          });
          goalEditables.set(goal.id, part);
        }
      }

      // Seed storyStorage
      for (const goal of currentGoals) {
        if (goal.text) {
          api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
        }
      }

      // Build and replace content tree
      const goalParts = currentGoals.map((goal) => goalEditables.get(goal.id)!);

      api.v1.ui.updateParts([
        { id: CR.GOALS_LIST, style: { display: "flex" }, content: goalParts },
      ]);

      // Update view text
      const viewUpdates = currentGoals.map((goal) => {
        const viewId = `${CR.goal(goal.id).TEXT}-view`;
        if (goal.text) {
          const display = formatTagsWithEmoji(goal.text)
            .replace(/\n/g, "  \n").replace(/</g, "\\<");
          return { id: viewId, text: display };
        }
        return { id: viewId, text: "_Generating..._" };
      });
      api.v1.ui.updateParts(viewUpdates);
    };

    // Goals list — reactive updates (only rebuild on add/remove/text changes, not selected toggle)
    useSelector(
      (s) => s.crucible.goals.map((g) => `${g.id}:${g.text}`).join("\0"),
      () => rebuildGoalsList(ctx.getState().crucible.goals),
    );

    // Auto-collapse goals when entering chaining/building
    useSelector(
      (s) => s.crucible.phase,
      (p) => {
        if (p === "chaining" || p === "building") {
          api.v1.storyStorage.set("cr-goals-collapsed", "true");
        }
      },
    );

    // Goal controls + confirm button + star hint visibility by phase
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        hasGoals: s.crucible.goals.length > 0,
        hasSelectedGoals: s.crucible.goals.some((g) => g.selected),
        isGenerating: s.runtime.activeRequest !== null,
      }),
      (slice) => {
        const pre = slice.phase === "idle" || slice.phase === "goals";
        const canAct = !slice.isGenerating;

        api.v1.ui.updateParts([
          {
            id: "cr-goal-controls",
            style: this.style?.("headerRow", !pre && "hidden"),
          },
          {
            id: "cr-confirm-goals-btn",
            style: this.style?.("btnPrimary",
              !(slice.phase === "goals" && slice.hasSelectedGoals && canAct) && "hidden"),
          },
          {
            id: "cr-star-hint",
            style: this.style?.("starHint",
              !(slice.hasGoals && !slice.hasSelectedGoals) && "hidden"),
          },
        ]);
      },
    );

    return collapsibleSection({
      id: "cr-goals-section",
      title: "Goals",
      storageKey: "story:cr-goals-collapsed",
      style: { overflow: "visible" },
      content: [
        row({
          id: "cr-goal-controls",
          style: this.style?.("headerRow", !preChaining && "hidden"),
          content: [
            goalsBtnPart,
            clearGoalsPart,
          ],
        }),
        column({
          id: CR.GOALS_LIST,
          style: hasGoals
            ? this.style?.("section")
            : this.style?.("hidden"),
          content: initialGoalParts,
        }),
        button({
          id: CR.ADD_GOAL_BTN,
          text: "+ Goal",
          style: this.style?.("btn"),
          callback: () => {
            dispatch(goalAdded({
              goal: { id: api.v1.uuid(), text: "[GOAL] New goal\n[STAKES] \n[THEME] \n[EMOTIONAL ARC] \n[TERMINAL CONDITION] ", selected: false },
            }));
          },
        }),
        text({
          id: "cr-star-hint",
          text: "_Star the goals you want to build from._",
          markdown: true,
          style: this.style?.("starHint", !(hasGoals && !hasSelectedGoals) && "hidden"),
        }),
        button({
          id: "cr-confirm-goals-btn",
          text: "Build World",
          style: phase === "goals" && hasSelectedGoals && !isGenerating
            ? this.style?.("btnPrimary")
            : this.style?.("hidden"),
          callback: () => dispatch(goalsConfirmed()),
        }),
      ],
    });
  },
});
