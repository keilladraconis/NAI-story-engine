import { Component, createEvents } from "../../../../lib/nai-act";
import { BrainstormActions } from "./types";
import { IDS } from "../../framework/ids";
import { BrainstormMessage } from "../../../core/store/types";
import { calculateTextAreaHeight } from "../../ui-components";
import { RootState } from "../../../core/store/types";
import { FieldID } from "../../../config/field-definitions";

export interface MessageProps {
  message: BrainstormMessage;
  actions: BrainstormActions;
}

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  VIEW_CONTAINER: { width: "100%" },
  EDIT_CONTAINER: { width: "100%" },
};

const events = createEvents({
  edit: (props: MessageProps) => props.actions.onEdit(props.message.id),
  save: (props: MessageProps) => props.actions.onSave(props.message.id),
  retry: (props: MessageProps) => props.actions.onRetry(props.message.id),
  delete: (props: MessageProps) => props.actions.onDelete(props.message.id),
});

export const Message: Component<MessageProps, RootState> = {
  id: (props) => IDS.BRAINSTORM.message(props.message.id).ROOT,

  describe(props) {
    const { message: msg } = props;
    const ids = IDS.BRAINSTORM.message(msg.id);
    const isUser = msg.role === "user";

    // Styling
    const bgColor = isUser
      ? "rgba(64, 156, 255, 0.2)"
      : "rgba(255, 255, 255, 0.05)";
    const align = isUser ? "flex-end" : "flex-start";
    const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

    // --- View Mode Components ---

    const textDisplay = text({
      id: ids.TEXT_DISPLAY,
      text: msg.content,
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
          id: ids.ACTIONS.EDIT,
          iconId: "edit-3",
          style: { padding: "4px", background: "none" },
          callback: () => events.edit(props),
        }),
        button({
          id: ids.ACTIONS.RETRY,
          iconId: "rotate-cw",
          style: { padding: "4px", background: "none" },
          callback: () => events.retry(props),
        }),
        button({
          id: ids.ACTIONS.DELETE,
          iconId: "trash",
          style: { padding: "4px", background: "none" },
          callback: () => events.delete(props),
        }),
      ].filter(Boolean) as UIPart[],
    });

    const viewContainer = column({
      id: ids.VIEW_CONTAINER,
      // hidden: false -> default visible
      style: STYLES.VIEW_CONTAINER,
      content: [textDisplay, viewButtons],
    });

    // --- Edit Mode Components ---

    const textInput = multilineTextInput({
      id: ids.TEXT_INPUT,
      initialValue: msg.content,
      storageKey: `story:${ids.TEXT_INPUT}`,
      style: {
        "min-height": "40px",
        width: "100%",
        height: calculateTextAreaHeight(msg.content),
      },
    });

    const saveButton = button({
      id: ids.ACTIONS.SAVE,
      iconId: "save",
      style: { padding: "4px", background: "none" },
      callback: () => events.save(props),
    });

    const editContainer = column({
      id: ids.EDIT_CONTAINER,
      // hidden: true -> display: none
      style: { ...STYLES.EDIT_CONTAINER, display: "none" },
      content: [
        textInput,
        row({
          style: { "justify-content": "flex-end", "margin-top": "4px" },
          content: [saveButton],
        }),
      ],
    });

    // --- Wrapper ---

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
          content: [
            text({
              text: isUser ? "You" : "Brainstorm",
              style: {
                "font-size": "0.7em",
                opacity: 0.7,
                "margin-bottom": "2px",
              },
            }),
            viewContainer,
            editContainer,
          ],
        }),
      ],
    });
  },

  bind({ useSelector, updateParts }, props) {
    const ids = IDS.BRAINSTORM.message(props.message.id);

    // Watch editing state
    useSelector(
      (state) => state.ui.brainstormEditingMessageId === props.message.id,
      (isEditing) => {
        updateParts([
          {
            id: ids.VIEW_CONTAINER,
            style: isEditing
              ? { ...STYLES.VIEW_CONTAINER, display: "none" }
              : STYLES.VIEW_CONTAINER,
          },
          {
            id: ids.EDIT_CONTAINER,
            style: isEditing
              ? STYLES.EDIT_CONTAINER
              : { ...STYLES.EDIT_CONTAINER, display: "none" },
          },
        ]);

        updateParts([
          {
            id: ids.ACTIONS.RETRY,
            style: {
              padding: "4px",
              background: "none",
              display: isEditing ? "none" : "block",
            },
          },
        ]);
      },
    );

    // Watch content for updates (streaming or external edits)
    // We assume message ID is stable and unique.
    useSelector(
      (state) => {
        const field = state.story.fields[FieldID.Brainstorm]; // Need FieldID
        const message = field?.data?.messages?.find(
          (m: BrainstormMessage) => m.id === props.message.id,
        );
        return message?.content;
      },
      (content) => {
        if (typeof content === "string") {
          // Update Text Display
          updateParts([{ id: ids.TEXT_DISPLAY, text: content }]);
        }
      },
    );
  },
};
