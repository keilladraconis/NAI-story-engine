import { BrainstormActions } from "./types";
import { IDS } from "../../framework/ids";
import { BrainstormMessage } from "../../../core/store/types";
import { Message } from "./Message";

export interface ListProps {
  initialMessages: BrainstormMessage[];
  actions: BrainstormActions;
}

const { column } = api.v1.ui.part;

export const List = {
  describe(props: ListProps) {
    // Render initial list (reversed)
    const children = props.initialMessages
      .slice()
      .reverse()
      .map((msg) => Message.describe({ message: msg, actions: props.actions }));

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
};
