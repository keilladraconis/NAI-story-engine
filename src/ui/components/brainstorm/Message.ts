import {
  BindContext,
  createEvents,
  defineComponent,
} from "../../../../lib/nai-act";
import { BrainstormMessage, RootState } from "../../../core/store/types";
import {
  messageRemoved,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  uiBrainstormRetryGeneration,
} from "../../../core/store";
import { IDS } from "../../framework/ids";
import { calculateTextAreaHeight } from "../../utils";

export interface MessageProps {
  message: BrainstormMessage;
}

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

type MessageEvents = {
  edit(): void;
  save(): void;
  retry(): void;
  delete(): void;
};

export const Message = defineComponent({
  id: (props: MessageProps) => `kse-bs-msg-${props.message.id}`,
  events: createEvents<MessageProps, MessageEvents>(),

  describe(props: MessageProps) {
    const { message } = props;
    const ids = IDS.BRAINSTORM.message(message.id);
    const isUser = message.role === "user";

    // Styles
    const bgColor = isUser
      ? "rgba(64, 156, 255, 0.2)"
      : "rgba(255, 255, 255, 0.05)";
    const align = isUser ? "flex-end" : "flex-start";
    const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

    // --- View Mode ---

    const textDisplay = text({
      id: ids.TEXT,
      text: message.content,
      markdown: true,
      style: { "word-break": "break-word", "user-select": "text" },
    });

    const viewButtons = row({
      style: {
        "margin-top": "5px",
        gap: "5px",
        "justify-content": "flex-end",
        opacity: 0.6,
      },
      content: [
        button({
          iconId: "edit-3",
          style: { padding: "4px" },
          callback: () => this.events.edit({ message }),
          id: `${ids.ROOT}-btn-edit`,
        }),
        button({
          iconId: "rotate-cw",
          style: { padding: "4px" },
          callback: () => this.events.retry({ message }),
          id: `${ids.ROOT}-btn-retry`,
        }),
        button({
          iconId: "trash",
          style: { padding: "4px" },
          callback: () => this.events.delete({ message }),
          id: `${ids.ROOT}-btn-delete`,
        }),
      ],
    });

    const viewContainer = column({
      id: ids.VIEW,
      style: { width: "100%" },
      content: [
        row({
          style: { "justify-content": "space-between" },
          content: [
            text({
              text: isUser ? "You" : "Brainstorm",
              style: {
                "font-size": "0.7em",
                opacity: 0.7,
                "margin-bottom": "2px",
              },
            }),
            viewButtons,
          ],
        }),
        textDisplay,
      ],
    });

    // --- Edit Mode ---

    const textInput = multilineTextInput({
      id: ids.INPUT,
      storageKey: `story:draft-${ids.INPUT}`,
      style: {
        "min-height": "40px",
        width: "100%",
        height: calculateTextAreaHeight(message.content),
      },
      initialValue: message.content,
    });

    const saveButton = button({
      iconId: "save",
      style: { padding: "4px", background: "none" },
      callback: () => this.events.save({ message }),
      id: `${ids.ROOT}-btn-save`,
    });

    const editContainer = column({
      id: ids.EDIT,
      style: { width: "100%", display: "none" },
      content: [
        row({
          style: { "justify-content": "flex-end", "margin-top": "4px" },
          content: [saveButton],
        }),
        textInput,
      ],
    });

    return row({
      id: ids.ROOT,
      style: { "justify-content": align, width: "100%" },
      content: [
        column({
          style: {
            "background-color": bgColor,
            padding: "10px",
            "border-radius": radius,
            width: "85%",
            border: "none",
          },
          content: [viewContainer, editContainer],
        }),
      ],
    });
  },

  onMount(props, ctx: BindContext<RootState>) {
    const { dispatch, useSelector } = ctx;
    const ids = IDS.BRAINSTORM.message(props.message.id);

    this.events.attach({
      edit(p) {
        dispatch(uiBrainstormMessageEditBegin({ id: p.message.id }));
      },
      save(_p) {
        dispatch(uiBrainstormMessageEditEnd());
      },
      retry(p) {
        dispatch(uiBrainstormRetryGeneration({ messageId: p.message.id }));
      },
      delete(p) {
        dispatch(messageRemoved(p.message.id));
      },
    });

    // Bind: Toggle View/Edit
    useSelector(
      (state) => state.brainstorm.editingMessageId === props.message.id,
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: ids.VIEW,
            style: { display: isEditing ? "none" : "block" },
          },
          {
            id: ids.EDIT,
            style: { display: isEditing ? "block" : "none" },
          },
        ]);
      },
    );

    // Bind: Content Updates (Streaming)
    useSelector(
      (state) =>
        state.brainstorm.messages.find((m) => m.id === props.message.id)
          ?.content,
      (content) => {
        if (content !== undefined) {
          api.v1.ui.updateParts([{ id: ids.TEXT, text: content }]);
        }
      },
    );
  },
});
