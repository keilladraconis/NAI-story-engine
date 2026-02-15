import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalToggled,
  goalRemoved,
  goalTextUpdated,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { NAI_HEADER } from "../../colors";

const { row, column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export interface GoalCardProps {
  goalId: string;
  selected: boolean;
}

const FAV_STYLE = {
  padding: "2px 6px",
  "font-size": "0.8em",
  color: NAI_HEADER,
  opacity: "1",
};

const FAV_STYLE_OFF = {
  padding: "2px 6px",
  "font-size": "0.8em",
  opacity: "0.5",
};

const GOAL_BTN_STYLE = {
  padding: "2px 6px",
  "font-size": "0.8em",
  opacity: "0.5",
};

export const GoalCard = defineComponent<GoalCardProps, RootState>({
  id: (props) => CR.goal(props.goalId).ROOT,

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { goalId, selected } = props;
    const ids = CR.goal(goalId);

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      storageKey: `cr-goal-${goalId}`,
      placeholder: "[GOAL] ...\n[STAKES] ...\n[THEME] ...",
      onSave: (content: string) =>
        dispatch(goalTextUpdated({ goalId, text: content })),
    });

    // Reactively update heart button style when selected state changes
    useSelector(
      (s) => s.crucible.goals.find((g) => g.id === goalId)?.selected ?? false,
      (isFav) => {
        api.v1.ui.updateParts([
          { id: ids.FAV_BTN, style: isFav ? FAV_STYLE : FAV_STYLE_OFF },
        ]);
      },
    );

    return column({
      id: ids.ROOT,
      style: {
        padding: "6px 8px",
        "border-radius": "4px",
        "background-color": "rgba(255,255,255,0.04)",
        "border-left": "3px solid rgba(245,243,194,0.5)",
        gap: "2px",
      },
      content: [
        row({
          style: { "justify-content": "flex-end", gap: "2px" },
          content: [
            button({
              id: ids.FAV_BTN,
              text: "",
              iconId: "heart",
              style: selected ? FAV_STYLE : FAV_STYLE_OFF,
              callback: () => dispatch(goalToggled({ goalId })),
            }),
            button({
              id: ids.DEL_BTN,
              text: "",
              iconId: "trash-2",
              style: GOAL_BTN_STYLE,
              callback: () => dispatch(goalRemoved({ goalId })),
            }),
          ],
        }),
        editable,
      ],
    });
  },
});
