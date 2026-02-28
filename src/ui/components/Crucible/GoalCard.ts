import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalRemoved,
  goalAcceptanceToggled,
  goalTextUpdated,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import { NAI_WARNING } from "../../colors";

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

const ACCEPT_BTN_BASE = { padding: "2px 6px", "font-size": "0.8em" };
const COLOR_ACCEPTED = "rgb(100, 220, 120)";
const COLOR_REJECTED = NAI_WARNING;

function acceptBtnStyle(accepted: boolean) {
  return { ...ACCEPT_BTN_BASE, color: accepted ? COLOR_ACCEPTED : COLOR_REJECTED };
}

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

    const acceptBtnId = `${ids.ROOT}-accept`;
    const goal = ctx.getState().crucible.goals.find((g) => g.id === goalId);
    const initialAccepted = goal?.accepted ?? true;

    // Reactively update view text when this goal's text changes.
    useSelector(
      (s) => s.crucible.goals.find((g) => g.id === goalId)?.text,
      (text) => {
        const display = formatTagsWithEmoji(text ?? "_Generating..._").replace(/\n/g, "  \n").replace(/</g, "\\<");
        api.v1.ui.updateParts([{ id: `${ids.TEXT}-view`, text: display }]);
      },
    );

    const acceptBtn = api.v1.ui.part.button({
      id: acceptBtnId,
      iconId: initialAccepted ? "check" : "x",
      style: acceptBtnStyle(initialAccepted),
      callback: () => dispatch(goalAcceptanceToggled({ goalId })),
    });

    useSelector(
      (s) => s.crucible.goals.find((g) => g.id === goalId)?.accepted,
      (accepted) => {
        const a = accepted ?? true;
        api.v1.ui.updateParts([
          { id: acceptBtnId, iconId: a ? "check" : "x", style: acceptBtnStyle(a) },
        ]);
      },
    );

    const delBtn = api.v1.ui.part.button({
      id: ids.DEL_BTN,
      iconId: "trash-2",
      style: GOAL_BTN_STYLE,
      callback: () => dispatch(goalRemoved({ goalId })),
    });

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      getContent: () => {
        const g = ctx.getState().crucible.goals.find((g) => g.id === goalId);
        return g?.text ?? "";
      },
      placeholder: "[GOAL] ...",
      formatDisplay: formatTagsWithEmoji,
      onSave: (content: string) =>
        dispatch(goalTextUpdated({ goalId, text: content })),
      extraControls: [acceptBtn, delBtn],
    });

    return column({
      id: ids.ROOT,
      style: this.style?.("card"),
      content: [editable],
    });
  },
});
