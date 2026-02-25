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

/** Human-readable labels for detected narrative shapes. */
const SHAPE_LABELS: Record<string, string> = {
  CLIMACTIC_CHOICE: "Climactic Choice",
  SPIRAL_DESCENT: "Spiral Descent",
  THRESHOLD_CROSSING: "Threshold Crossing",
  EQUILIBRIUM_RESTORED: "Equilibrium Restored",
  ACCUMULATED_WEIGHT: "Accumulated Weight",
  REVELATION: "Revelation",
};

const { row, column, collapsibleSection, text } = api.v1.ui.part;

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
    shapeBadge: {
      "font-size": "0.7em",
      padding: "2px 6px",
      "border-radius": "3px",
      "background-color": "rgba(168,162,255,0.15)",
      color: "rgba(168,162,255,0.9)",
      "letter-spacing": "0.04em",
    },
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const { goals, detectedShape } = state.crucible;

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
        const crucibleTypes = new Set(["cruciblePrereqs", "crucibleElements"]);
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

    // Shape badge — shows detected narrative shape
    const initialShapeLabel = detectedShape ? (SHAPE_LABELS[detectedShape] || detectedShape) : "";
    const shapeBadgePart = text({
      id: CR.SHAPE_BADGE,
      text: initialShapeLabel,
      style: initialShapeLabel ? this.style?.("shapeBadge") : this.style?.("hidden"),
    });

    useSelector(
      (s) => s.crucible.detectedShape,
      () => {
        const shape = ctx.getState().crucible.detectedShape;
        const label = shape ? (SHAPE_LABELS[shape] || shape) : "";
        api.v1.ui.updateParts([{
          id: CR.SHAPE_BADGE,
          text: label,
          style: label ? this.style?.("shapeBadge") : this.style?.("hidden"),
        }]);
      },
    );

    // "Generate Goals" button — shape detection + 3 goals; shown when no goals exist
    const { part: generateGoalsBtn } = ctx.render(GenerationButton, {
      id: "cr-generate-goals-btn",
      label: "Generate Goals",
      variant: "button",
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        const types = new Set(["crucibleShapeDetection", "crucibleGoal"]);
        if (s.runtime.activeRequest && types.has(s.runtime.activeRequest.type)) return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => types.has(q.type))?.id;
      },
      onGenerate: () => dispatch(crucibleGoalsRequested()),
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
        goalCardCache.clear();
        api.v1.ui.updateParts([{ id: CR.GOALS_LIST, style: this.style?.("hidden") }]);
        return;
      }

      // Clean up removed goals
      const currentIds = new Set(currentGoals.map((g) => g.id));
      for (const [id] of goalCardCache) {
        if (!currentIds.has(id)) goalCardCache.delete(id);
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
          storageKey: "story:cr-goals-collapsed",
          style: { overflow: "visible" },
          content: [
            // Empty state: just the "Generate Goals" button
            row({
              id: "cr-empty-row",
              style: hasGoals ? this.style?.("hidden") : this.style?.("headerRow"),
              content: [generateGoalsBtn],
            }),
            // Populated state: shape badge, add goal, clear
            row({
              id: "cr-goal-controls",
              style: hasGoals ? this.style?.("headerRow") : this.style?.("hidden"),
              content: [
                shapeBadgePart,
                api.v1.ui.part.button({
                  id: CR.ADD_GOAL_BTN,
                  text: "+ Goal",
                  style: this.style?.("btn"),
                  callback: () => dispatch(crucibleAddGoalRequested()),
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
