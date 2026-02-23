import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalAdded,
  goalsCleared,
  crucibleStopRequested,
  crucibleBuildRequested,
} from "../../../core/store/slices/crucible";
import { requestQueued } from "../../../core/store/slices/runtime";
import { generationSubmitted } from "../../../core/store/slices/ui";
import { buildCrucibleGoalStrategy } from "../../../core/utils/crucible-strategy";
import { IDS } from "../../framework/ids";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";
import { GoalCard } from "./GoalCard";
import { formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import {
  NAI_WARNING,
} from "../../colors";

const { row, column, collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const GoalsSection = defineComponent<undefined, RootState>({
  id: () => "cr-goals-section",

  styles: {
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    goalsList: {
      gap: "6px",
    },
    btn: {
      padding: "5px 10px",
      "font-size": "0.8em",
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
    const { goals } = state.crucible;

    const { part: clearGoalsPart } = ctx.render(ButtonWithConfirmation, {
      id: CR.CLEAR_GOALS_BTN,
      label: "",
      iconId: "trash",
      confirmLabel: "Clear all goals?",
      buttonStyle: this.style?.("btnDanger"),
      onConfirm: () => dispatch(goalsCleared()),
    });

    // "Build World" button — dispatches crucibleBuildRequested
    const { part: buildWorldBtn } = ctx.render(GenerationButton, {
      id: "cr-build-world-btn",
      label: "Build World",
      variant: "button",
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueLen: s.runtime.queue.length,
        hasStarred: s.crucible.goals.some((g) => g.starred),
        phase: s.crucible.phase,
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        const crucibleTypes = new Set(["crucibleStructuralGoal", "cruciblePrereqs", "crucibleElements"]);
        if (s.runtime.activeRequest && crucibleTypes.has(s.runtime.activeRequest.type)) {
          return s.runtime.activeRequest.id;
        }
        const queued = s.runtime.queue.find(
          (q) => crucibleTypes.has(q.type),
        );
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) => !proj.hasStarred,
      onCancel: () => dispatch(crucibleStopRequested()),
      onGenerate: () => {
        dispatch(crucibleBuildRequested());
      },
    });

    // --- Per-goal card cache ---
    const goalCardCache = new Map<string, UIPart>();

    const ensureGoalCard = (goalId: string): UIPart => {
      if (!goalCardCache.has(goalId)) {
        const { part } = ctx.render(GoalCard, { goalId });
        goalCardCache.set(goalId, part);
      }
      return goalCardCache.get(goalId)!;
    };

    const hasGoals = goals.length > 0;
    const initialGoalCards = goals.map((g) => ensureGoalCard(g.id));

    // --- Reactive: rebuild goal list on add/remove/text changes ---

    const rebuildGoalsList = (): void => {
      const st = ctx.getState();
      const currentGoals = st.crucible.goals;

      if (currentGoals.length === 0) {
        goalCardCache.clear();
        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: this.style?.("hidden") },
        ]);
        return;
      }

      // Clean up removed goals
      const currentIds = new Set(currentGoals.map((g) => g.id));
      for (const [id] of goalCardCache) {
        if (!currentIds.has(id)) {
          goalCardCache.delete(id);
        }
      }

      const sections = currentGoals.map((g) => ensureGoalCard(g.id));

      api.v1.ui.updateParts([
        { id: CR.GOALS_LIST, style: this.style?.("goalsList"), content: sections },
      ]);

      // Update view text for goal cards
      for (const goal of currentGoals) {
        const viewId = `${CR.goal(goal.id).TEXT}-view`;
        if (goal.text) {
          const display = formatTagsWithEmoji(goal.text)
            .replace(/\n/g, "  \n").replace(/</g, "\\<");
          api.v1.ui.updateParts([{ id: viewId, text: display }]);
        } else {
          api.v1.ui.updateParts([{ id: viewId, text: "_Generating..._" }]);
        }
      }
    };

    // Rebuild on goal add/remove/text changes
    useSelector(
      (s) => {
        const parts: string[] = [];
        for (const g of s.crucible.goals) {
          parts.push(`${g.id}:${g.text}`);
        }
        return parts.join("\0");
      },
      () => rebuildGoalsList(),
    );

    return column({
      id: "cr-goals-section",
      style: { gap: "6px" },
      content: [
        collapsibleSection({
          id: "cr-goals-collapsible",
          title: "Goals",
          storageKey: "story:cr-goals-collapsed",
          style: { overflow: "visible" },
          content: [
            row({
              id: "cr-goal-controls",
              style: this.style?.("headerRow"),
              content: [
                api.v1.ui.part.button({
                  id: CR.ADD_GOAL_BTN,
                  text: "+ Goal",
                  style: this.style?.("btn"),
                  callback: () => {
                    const goalId = api.v1.uuid();
                    dispatch(goalAdded({ goal: { id: goalId, text: "", starred: false } }));
                    const strategy = buildCrucibleGoalStrategy(ctx.getState, goalId);
                    dispatch(requestQueued({
                      id: strategy.requestId,
                      type: "crucibleGoal",
                      targetId: goalId,
                    }));
                    dispatch(generationSubmitted(strategy));
                  },
                }),
                clearGoalsPart,
              ],
            }),
            column({
              id: CR.GOALS_LIST,
              style: hasGoals ? this.style?.("goalsList") : this.style?.("hidden"),
              content: initialGoalCards,
            }),
          ],
        }),
        buildWorldBtn,
      ],
    });
  },
});
