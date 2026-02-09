import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { Message } from "./Message";

const { column } = api.v1.ui.part;

export const List = defineComponent({
  id: () => IDS.BRAINSTORM.LIST,
  events: undefined,

  build(_props: void, ctx: BindContext<RootState>) {
    const { useSelector } = ctx;
    let messageCleanups: (() => void)[] = [];

    // Read initial messages
    const initialMessages = ctx.getState().brainstorm.messages;
    const initialReversed = initialMessages.slice().reverse();
    const initialChildren = initialReversed.map((msg) => {
      const { part, unmount } = ctx.render(Message, { message: msg });
      messageCleanups.push(unmount);
      return part;
    });

    // Subscribe for future changes
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

    return column({
      id: IDS.BRAINSTORM.LIST,
      content: initialChildren,
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
});
