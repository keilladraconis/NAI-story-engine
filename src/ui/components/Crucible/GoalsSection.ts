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

const { text, row, column, button } = api.v1.ui.part;

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
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

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

    const rebuildGoalsList = (goals: typeof state.crucible.goals): void => {
      if (goals.length === 0) {
        goalEditables.clear();
        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: this.style?.("hidden") },
        ]);
        return;
      }

      // Render GoalCard for new goals, clean up removed ones
      const currentIds = new Set(goals.map((g) => g.id));
      for (const [id] of goalEditables) {
        if (!currentIds.has(id)) goalEditables.delete(id);
      }
      for (const goal of goals) {
        if (!goalEditables.has(goal.id)) {
          const { part } = ctx.render(GoalCard, {
            goalId: goal.id,
            selected: goal.selected,
          });
          goalEditables.set(goal.id, part);
        }
      }

      // Seed storyStorage
      for (const goal of goals) {
        if (goal.text) {
          api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
        }
      }

      // Build and replace content tree
      const goalParts = goals.map((goal) => goalEditables.get(goal.id)!);

      api.v1.ui.updateParts([
        { id: CR.GOALS_LIST, style: { display: "flex" }, content: goalParts },
      ]);

      // Update view text
      const viewUpdates = goals.map((goal) => {
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

    // Goal controls + confirm button visibility by phase
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        hasSelectedGoals: s.crucible.goals.some((g) => g.selected),
        isGenerating: s.runtime.activeRequest !== null,
      }),
      (slice) => {
        const preChaining = slice.phase === "idle" || slice.phase === "goals";
        const canAct = !slice.isGenerating;

        api.v1.ui.updateParts([
          {
            id: "cr-goal-controls",
            style: preChaining ? { display: "flex" } : { display: "none" },
          },
          {
            id: "cr-confirm-goals-btn",
            style: slice.phase === "goals" && slice.hasSelectedGoals && canAct
              ? this.style?.("btnPrimary")
              : this.style?.("hidden"),
          },
        ]);
      },
    );

    return column({
      id: "cr-goals-section",
      style: { gap: "4px" },
      content: [
        row({ style: this.style?.("divider"), content: [] }),
        row({
          id: "cr-goal-controls",
          style: { ...this.style?.("headerRow"), gap: "6px" },
          content: [
            text({ text: "**Goals**", style: this.style?.("sectionTitle"), markdown: true }),
            goalsBtnPart,
            clearGoalsPart,
          ],
        }),
        column({
          id: CR.GOALS_LIST,
          style: state.crucible.goals.length > 0
            ? this.style?.("section")
            : this.style?.("hidden"),
          content: [],
        }),
        button({
          id: CR.ADD_GOAL_BTN,
          text: "+ Goal",
          style: this.style?.("btn"),
          callback: () => {
            dispatch(goalAdded({
              goal: { id: api.v1.uuid(), text: "[GOAL] New goal\n[STAKES] \n[THEME] \n[EMOTIONAL ARC] \n[TERMINAL CONDITION] ", selected: true },
            }));
          },
        }),
        button({
          id: "cr-confirm-goals-btn",
          text: "Confirm Goals & Start Chaining",
          style: state.crucible.phase === "goals"
            ? this.style?.("btnPrimary")
            : this.style?.("hidden"),
          callback: () => dispatch(goalsConfirmed()),
        }),
      ],
    });
  },
});
