import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { Message } from "./Message";

const { column } = api.v1.ui.part;

export const List = defineComponent({
  id: () => IDS.BRAINSTORM.LIST,
  events: undefined,

  describe(_props: void) {
    return column({
      id: IDS.BRAINSTORM.LIST,
      content: [],
      style: {
        flex: 1,
        overflow: "auto",
        gap: "10px",
        padding: "8px",
        "padding-bottom": "20px",
        "flex-direction": "column-reverse",
        "justify-content": "flex-start",
      },
    });
  },

  onMount(_props, ctx: BindContext<RootState>) {
    const { useSelector } = ctx;
    let messageCleanups: (() => void)[] = [];

    useSelector(
      (state) => state.brainstorm.messages,
      (messages) => {
        // Cleanup previous
        messageCleanups.forEach((fn) => fn());
        messageCleanups = [];

        const reversed = messages.slice().reverse();

        const children = reversed.map((msg) => {
          const { part, unmount } = ctx.render(Message, { message: msg });
          messageCleanups.push(unmount);
          return part;
        });

        api.v1.ui.updateParts([
          {
            id: IDS.BRAINSTORM.LIST,
            content: children,
          },
        ]);
      },
    );
  },
});
