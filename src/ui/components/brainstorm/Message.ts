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

  styles: {
    textDisplay: { "word-break": "break-word", "user-select": "text" },
    viewButtonsRow: {
      "margin-top": "5px",
      gap: "5px",
      "justify-content": "flex-end",
      opacity: 0.6,
    },
    buttonIcon: { padding: "4px" },
    labelText: { "font-size": "0.7em", opacity: 0.7, "margin-bottom": "2px" },
    editContainer: { width: "100%" },
    saveRow: { "justify-content": "flex-end", "margin-top": "4px" },
    viewContainer: { width: "100%" },
    buttonRow: { "justify-content": "space-between" },
    textInput: { "min-height": "40px", width: "100%" },
    saveButton: { padding: "4px", background: "none" },
    rootRow: { width: "100%" },
    rootRowUser: { "justify-content": "flex-end" },
    rootRowAssistant: { "justify-content": "flex-start" },
    bubble: { padding: "10px", width: "85%", border: "none" },
    bubbleUser: {
      "background-color": "rgba(64, 156, 255, 0.2)",
      "border-radius": "12px 12px 0 12px",
    },
    bubbleAssistant: {
      "background-color": "rgba(255, 255, 255, 0.05)",
      "border-radius": "12px 12px 12px 0",
    },
    hidden: { display: "none" },
    visible: { display: "block" },
  },

  describe(props: MessageProps) {
    const { message } = props;
    const ids = IDS.BRAINSTORM.message(message.id);
    const isUser = message.role === "user";

    // --- View Mode ---

    const textDisplay = text({
      id: ids.TEXT,
      text: message.content,
      markdown: true,
      style: this.style?.("textDisplay"),
    });

    const viewButtons = row({
      style: this.style?.("viewButtonsRow"),
      content: [
        button({
          iconId: "edit-3",
          style: this.style?.("buttonIcon"),
          callback: () => this.events.edit({ message }),
          id: `${ids.ROOT}-btn-edit`,
        }),
        button({
          iconId: "rotate-cw",
          style: this.style?.("buttonIcon"),
          callback: () => this.events.retry({ message }),
          id: `${ids.ROOT}-btn-retry`,
        }),
        button({
          iconId: "trash",
          style: this.style?.("buttonIcon"),
          callback: () => this.events.delete({ message }),
          id: `${ids.ROOT}-btn-delete`,
        }),
      ],
    });

    const viewContainer = column({
      id: ids.VIEW,
      style: this.style?.("viewContainer"),
      content: [
        row({
          style: this.style?.("buttonRow"),
          content: [
            text({
              text: isUser ? "You" : "Brainstorm",
              style: this.style?.("labelText"),
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
        ...this.style?.("textInput"),
        height: calculateTextAreaHeight(message.content),
      },
      initialValue: message.content,
    });

    const saveButton = button({
      iconId: "save",
      style: this.style?.("saveButton"),
      callback: () => this.events.save({ message }),
      id: `${ids.ROOT}-btn-save`,
    });

    const editContainer = column({
      id: ids.EDIT,
      style: this.style?.("editContainer", "hidden"),
      content: [
        row({
          style: this.style?.("saveRow"),
          content: [saveButton],
        }),
        textInput,
      ],
    });

    return row({
      id: ids.ROOT,
      style: this.style?.(
        "rootRow",
        isUser ? "rootRowUser" : "rootRowAssistant",
      ),
      content: [
        column({
          style: this.style?.(
            "bubble",
            isUser ? "bubbleUser" : "bubbleAssistant",
          ),
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
            style: this.style?.(
              "viewContainer",
              isEditing ? "hidden" : "visible",
            ),
          },
          {
            id: ids.EDIT,
            style: this.style?.(
              "editContainer",
              isEditing ? "visible" : "hidden",
            ),
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
