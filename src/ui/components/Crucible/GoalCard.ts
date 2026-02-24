import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalRemoved,
  goalStarred,
  goalTextUpdated,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
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
    const { dispatch, useSelector } = ctx;
    const { goalId } = props;
    const ids = CR.goal(goalId);

    const starBtnId = `${ids.ROOT}-star`;
    const goal = ctx.getState().crucible.goals.find((g) => g.id === goalId);

    // Reactively update view text when goal text changes (owns its own display state)
    useSelector(
      (s) => s.crucible.goals.find((g) => g.id === goalId)?.text,
      (text) => {
        const display = text
          ? formatTagsWithEmoji(text).replace(/\n/g, "  \n").replace(/</g, "\\<")
          : "_Generating..._";
        api.v1.ui.updateParts([{ id: `${ids.TEXT}-view`, text: display }]);
      },
    );

    const starBtn = api.v1.ui.part.button({
      id: starBtnId,
      text: goal?.starred ? "★" : "☆",
      style: { ...GOAL_BTN_STYLE, opacity: goal?.starred ? "1" : "0.4" },
      callback: () => dispatch(goalStarred({ goalId })),
    });

    useSelector(
      (s) => s.crucible.goals.find((g) => g.id === goalId)?.starred,
      (starred) => {
        api.v1.ui.updateParts([
          { id: starBtnId, text: starred ? "★" : "☆", style: { ...GOAL_BTN_STYLE, opacity: starred ? "1" : "0.4" } },
        ]);
      },
    );

    const delBtn = api.v1.ui.part.button({
      id: ids.DEL_BTN,
      text: "",
      iconId: "trash-2",
      style: GOAL_BTN_STYLE,
      callback: () => dispatch(goalRemoved({ goalId })),
    });

    const goalDisplay = goal?.text
      ? formatTagsWithEmoji(goal.text).replace(/\n/g, "  \n").replace(/</g, "\\<")
      : goal ? "_Generating..._" : undefined;

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      getContent: () => {
        const g = ctx.getState().crucible.goals.find((g) => g.id === goalId);
        return g?.text ?? "";
      },
      placeholder: "[GOAL] ...",
      onSave: (content: string) =>
        dispatch(goalTextUpdated({ goalId, text: content })),
      extraControls: [starBtn, delBtn],
      initialDisplay: goalDisplay,
    });

    return column({
      id: ids.ROOT,
      style: this.style?.("card"),
      content: [editable],
    });
  },
});
