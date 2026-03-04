import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalsCleared,
  crucibleStopRequested,
  crucibleBuildRequested,
  crucibleGoalsRequested,
  crucibleAddGoalRequested,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";
import { GoalCard } from "./GoalCard";
import { NAI_WARNING } from "../../colors";

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
        hasAccepted: s.crucible.goals.some((g) => g.accepted),
        phase: s.crucible.phase,
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        const crucibleTypes = new Set(["cruciblePrereqs", "crucibleElements"]);
        if (s.runtime.activeRequest && crucibleTypes.has(s.runtime.activeRequest.type)) {
          return s.runtime.activeRequest.id;
        }
        const queued = s.runtime.queue.find(
          (q) => crucibleTypes.has(q.type),
        );
        return queued?.id;
      },
      isDisabledFromProjection: (proj: { hasAccepted: boolean }) => !proj.hasAccepted,
      onCancel: () => dispatch(crucibleStopRequested()),
      onGenerate: () => {
        dispatch(crucibleBuildRequested());
      },
    });

    const goalsBtnProps = {
      variant: "button" as const,
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleGoal") return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => q.type === "crucibleGoal")?.id;
      },
      onGenerate: () => dispatch(crucibleGoalsRequested()),
      onCancel: () => dispatch(crucibleStopRequested()),
    };

    // "Generate Goals" button — shown in empty state
    const { part: generateGoalsBtn } = ctx.render(GenerationButton, {
      id: "cr-generate-goals-btn",
      label: "Generate Goals",
      ...goalsBtnProps,
    });

    // "Generate Goals" button — shown in populated state (generates 3 more goals)
    const { part: moreGoalsBtn } = ctx.render(GenerationButton, {
      id: "cr-more-goals-btn",
      label: "Generate Goals",
      ...goalsBtnProps,
    });

    // --- Per-goal card cache (stores unmount so removed cards can be cleaned up) ---
    const goalCardCache = new Map<string, { part: UIPart; unmount: () => void }>();

    const ensureGoalCard = (goalId: string): UIPart => {
      const existing = goalCardCache.get(goalId);
      if (existing) return existing.part;
      const result = ctx.render(GoalCard, { goalId });
      goalCardCache.set(goalId, result);
      return result.part;
    };

    const hasGoals = goals.length > 0;
    const initialGoalCards = goals.map((g) => ensureGoalCard(g.id));

    // --- Reactive: rebuild goal list and swap empty/populated controls ---

    const rebuildGoalsList = (): void => {
      const st = ctx.getState();
      const currentGoals = st.crucible.goals;
      const nowEmpty = currentGoals.length === 0;

      // Swap controls visibility
      api.v1.ui.updateParts([
        { id: "cr-empty-row", style: nowEmpty ? this.style?.("headerRow") : this.style?.("hidden") },
        { id: "cr-goal-controls", style: nowEmpty ? this.style?.("hidden") : this.style?.("headerRow") },
      ]);

      if (nowEmpty) {
        for (const { unmount } of goalCardCache.values()) unmount();
        goalCardCache.clear();
        api.v1.ui.updateParts([{ id: CR.GOALS_LIST, style: this.style?.("hidden") }]);
        return;
      }

      // Clean up removed goals
      const currentIds = new Set(currentGoals.map((g) => g.id));
      for (const [id, { unmount }] of goalCardCache) {
        if (!currentIds.has(id)) { unmount(); goalCardCache.delete(id); }
      }

      api.v1.ui.updateParts([{
        id: CR.GOALS_LIST,
        style: this.style?.("goalsList"),
        content: currentGoals.map((g) => ensureGoalCard(g.id)),
      }]);
    };

    useSelector(
      (s) => s.crucible.goals.map((g) => g.id).join(","),
      () => rebuildGoalsList(),
    );

    return column({
      id: "cr-goals-section",
      style: { gap: "6px" },
      content: [
        collapsibleSection({
          id: "cr-goals-collapsible",
          title: "Goals",
          initialCollapsed: true,
          storageKey: "story:cr-goals-collapsed",
          style: { overflow: "visible" },
          content: [
            // Empty state: just the "Generate Goals" button
            row({
              id: "cr-empty-row",
              style: hasGoals ? this.style?.("hidden") : this.style?.("headerRow"),
              content: [generateGoalsBtn],
            }),
            // Populated state: add goal, generate more, clear
            row({
              id: "cr-goal-controls",
              style: hasGoals ? this.style?.("headerRow") : this.style?.("hidden"),
              content: [
                api.v1.ui.part.button({
                  id: CR.ADD_GOAL_BTN,
                  text: "+ Goal",
                  style: this.style?.("btn"),
                  callback: () => dispatch(crucibleAddGoalRequested()),
                }),
                moreGoalsBtn,
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
