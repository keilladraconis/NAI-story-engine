import { BindContext, defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { currentMessages } from "../../../core/store/slices/brainstorm";
import { IDS } from "../../framework/ids";
import { Message } from "./Message";

const { column } = api.v1.ui.part;

export const List = defineComponent({
  id: () => IDS.BRAINSTORM.LIST,

  build(_props: void, ctx: BindContext<RootState>) {
    return column({
      id: IDS.BRAINSTORM.LIST,
      style: {
        flex: 1,
        overflow: "auto",
        gap: "10px",
        padding: "8px",
        "padding-bottom": "20px",
        "flex-direction": "column-reverse",
        "justify-content": "flex-start",
      },
      content: ctx.bindList(
        IDS.BRAINSTORM.LIST,
        (state) => currentMessages(state.brainstorm).slice().reverse(),
        (msg) => msg.id,
        (msg) => ({ component: Message, props: { message: msg } }),
      ),
    });
  },
});
