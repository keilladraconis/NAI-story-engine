import { Component } from "../../../../lib/nai-act";
import { RootState, BrainstormMessage } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { Message } from "./Message";

const { column } = api.v1.ui.part;

export interface ListProps {
  initialMessages?: BrainstormMessage[];
}

export const List: Component<ListProps, RootState> = {
  id: () => IDS.BRAINSTORM.LIST,
  events: {},

  describe(props) {
    const children = (props.initialMessages || [])
      .slice()
      .reverse()
      .map((msg) => Message.describe({ message: msg }));

    return column({
      id: IDS.BRAINSTORM.LIST,
      content: children,
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

  onMount(props, ctx) {
    const { useSelector, mount } = ctx;
    let messageCleanups: (() => void)[] = [];

    useSelector(
      (state) => state.brainstorm.messages,
      (messages) => {
        // Cleanup previous
        messageCleanups.forEach((fn) => fn());
        messageCleanups = [];

        const reversed = messages.slice().reverse();

        const children = reversed.map((msg) => {
          const cleanup = mount(Message, { message: msg });
          messageCleanups.push(cleanup);
          return Message.describe({ message: msg });
        });

        api.v1.ui.updateParts([
          {
            id: IDS.BRAINSTORM.LIST,
            content: children,
          },
        ]);
      }
    );
  },
};