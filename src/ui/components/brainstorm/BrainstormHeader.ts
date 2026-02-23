import { BindContext, defineComponent } from "nai-act";
import { RootState, BrainstormMode } from "../../../core/store/types";
import { chatCreated, currentChat, modeChanged } from "../../../core/store/slices/brainstorm";
import { uiBrainstormSummarize } from "../../../core/store/slices/ui";
import { IDS } from "../../framework/ids";
import { openSessionsModal } from "./SessionsModal";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";

const { row, text, button } = api.v1.ui.part;

const MODE_ACTIVE_COWRITER = "rgba(80, 200, 120, 0.25)";
const MODE_ACTIVE_CRITIC = "rgba(255, 100, 100, 0.25)";
const MODE_INACTIVE = "transparent";

function modeButtonStyle(isActive: boolean, color: string) {
  return {
    padding: "2px 8px",
    "font-size": "0.75em",
    "border-radius": "4px",
    "background-color": isActive ? color : MODE_INACTIVE,
    border: isActive ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)",
    opacity: isActive ? "1" : "0.5",
  };
}

function updateModeButtons(mode: BrainstormMode) {
  api.v1.ui.updateParts([
    {
      id: IDS.BRAINSTORM.MODE_COWRITER_BTN,
      style: modeButtonStyle(mode === "cowriter", MODE_ACTIVE_COWRITER),
    },
    {
      id: IDS.BRAINSTORM.MODE_CRITIC_BTN,
      style: modeButtonStyle(mode === "critic", MODE_ACTIVE_CRITIC),
    },
  ]);
}

export const BrainstormHeader = defineComponent({
  id: () => IDS.BRAINSTORM.HEADER,

  build(_props: void, ctx: BindContext<RootState>) {
    const { dispatch, useSelector } = ctx;

    const chat = currentChat(ctx.getState().brainstorm);
    const initialTitle = chat.title;
    const initialMode = chat.mode || "cowriter";

    useSelector(
      (state) => {
        const c = currentChat(state.brainstorm);
        return { title: c.title, mode: c.mode || "cowriter" as BrainstormMode };
      },
      ({ title, mode }) => {
        api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.TITLE, text: title }]);
        updateModeButtons(mode);
      },
    );

    const { part: summarizeBtn } = ctx.render(ButtonWithConfirmation, {
      id: IDS.BRAINSTORM.SUMMARIZE_BTN,
      label: "Sum",
      confirmLabel: "Summarize chat?",
      style: { flex: "none" },
      buttonStyle: { padding: "2px 8px", "font-size": "0.75em" },
      onConfirm: () => dispatch(uiBrainstormSummarize()),
    });

    return row({
      id: IDS.BRAINSTORM.HEADER,
      style: {
        padding: "8px",
        "align-items": "center",
        gap: "6px",
        "border-bottom": "1px solid rgba(255, 255, 255, 0.1)",
      },
      content: [
        text({
          id: IDS.BRAINSTORM.TITLE,
          text: initialTitle,
          style: { flex: "1", "font-size": "0.85em", opacity: "0.8" },
        }),
        button({
          id: IDS.BRAINSTORM.MODE_COWRITER_BTN,
          text: "Co",
          style: modeButtonStyle(initialMode === "cowriter", MODE_ACTIVE_COWRITER),
          callback: () => dispatch(modeChanged("cowriter")),
        }),
        button({
          id: IDS.BRAINSTORM.MODE_CRITIC_BTN,
          text: "Crit",
          style: modeButtonStyle(initialMode === "critic", MODE_ACTIVE_CRITIC),
          callback: () => dispatch(modeChanged("critic")),
        }),
        summarizeBtn,
        button({
          id: IDS.BRAINSTORM.NEW_BTN,
          iconId: "plus",
          style: { width: "24px", padding: "4px" },
          callback: () => dispatch(chatCreated()),
        }),
        button({
          id: IDS.BRAINSTORM.SESSIONS_BTN,
          iconId: "folder",
          style: { width: "24px", padding: "4px" },
          callback: () => openSessionsModal(ctx),
        }),
      ],
    });
  },
});
