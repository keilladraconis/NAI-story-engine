import { BindContext, defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { chatCreated, currentChat } from "../../../core/store/slices/brainstorm";
import { IDS } from "../../framework/ids";
import { openSessionsModal } from "./SessionsModal";

const { row, text, button } = api.v1.ui.part;

export const BrainstormHeader = defineComponent({
  id: () => IDS.BRAINSTORM.HEADER,

  build(_props: void, ctx: BindContext<RootState>) {
    const { dispatch, useSelector } = ctx;

    const initialTitle = currentChat(ctx.getState().brainstorm).title;

    useSelector(
      (state) => currentChat(state.brainstorm).title,
      (title) => {
        api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.TITLE, text: title }]);
      },
    );

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
