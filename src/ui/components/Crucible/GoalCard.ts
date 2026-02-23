import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalRemoved,
  goalTextUpdated,
} from "../../../core/store/slices/crucible";
import { requestQueued } from "../../../core/store/slices/runtime";
import { generationSubmitted } from "../../../core/store/slices/ui";
import { buildCrucibleGoalStrategy } from "../../../core/utils/crucible-strategy";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { GenerationButton } from "../GenerationButton";
import { formatTagsWithEmoji } from "../../../core/utils/tag-parser";

const { column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export interface GoalCardProps {
  goalId: string;
}

const GOAL_BTN_STYLE = {
  padding: "2px 6px",
  "font-size": "0.8em",
  opacity: "0.5",
};

export const GoalCard = defineComponent<GoalCardProps, RootState>({
  id: (props) => CR.goal(props.goalId).ROOT,

  styles: {
    card: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(245,243,194,0.5)",
      gap: "2px",
    },
  },

  build(props, ctx) {
    const { dispatch } = ctx;
    const { goalId } = props;
    const ids = CR.goal(goalId);

    const { part: genBtn } = ctx.render(GenerationButton, {
      id: ids.GEN_BTN,
      variant: "icon",
      iconId: "refresh",
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        activeTargetId: s.runtime.activeRequest?.targetId,
        queueTargetIds: s.runtime.queue.map((q) => q.targetId),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleGoal" && s.runtime.activeRequest.targetId === goalId) {
          return s.runtime.activeRequest.id;
        }
        const queued = s.runtime.queue.find((q) => q.type === "crucibleGoal" && q.targetId === goalId);
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleBuild",
      onGenerate: () => {
        const strategy = buildCrucibleGoalStrategy(ctx.getState, goalId);
        dispatch(requestQueued({
          id: strategy.requestId,
          type: "crucibleGoal",
          targetId: goalId,
        }));
        dispatch(generationSubmitted(strategy));
      },
    });

    const delBtn = api.v1.ui.part.button({
      id: ids.DEL_BTN,
      text: "",
      iconId: "trash-2",
      style: GOAL_BTN_STYLE,
      callback: () => dispatch(goalRemoved({ goalId })),
    });

    const goal = ctx.getState().crucible.goals.find((g) => g.id === goalId);
    const goalDisplay = goal?.text ? formatTagsWithEmoji(goal.text) : undefined;

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      getContent: () => {
        const g = ctx.getState().crucible.goals.find((g) => g.id === goalId);
        return g?.text ?? "";
      },
      placeholder: "[GOAL] ...\n[OPEN] ...\n[OPEN] ...",
      onSave: (content: string) =>
        dispatch(goalTextUpdated({ goalId, text: content })),
      extraControls: [genBtn, delBtn],
      initialDisplay: goalDisplay,
    });

    return column({
      id: ids.ROOT,
      style: this.style?.("card"),
      content: [editable],
    });
  },
});
