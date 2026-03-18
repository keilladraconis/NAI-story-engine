import { BindContext, defineComponent } from "nai-act";
import { BrainstormMessage, RootState } from "../../../core/store/types";
import {
  messageRemoved,
  messageUpdated,
  uiBrainstormRetryGeneration,
} from "../../../core/store";
import { currentMessages } from "../../../core/store/slices/brainstorm";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";

export interface MessageProps {
  message: BrainstormMessage;
}

const { row, column, button } = api.v1.ui.part;

export const Message = defineComponent({
  id: (props: MessageProps) => `kse-bs-msg-${props.message.id}`,

  styles: {
    buttonIcon: { padding: "4px" },
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
  },

  build(props: MessageProps, ctx: BindContext<RootState>) {
    const { dispatch } = ctx;
    const { message } = props;
    const ids = IDS.BRAINSTORM.message(message.id);
    const isUser = message.role === "user";

    const retryBtn = button({
      id: `${ids.ROOT}-btn-retry`,
      iconId: "rotate-cw",
      style: this.style?.("buttonIcon"),
      callback: () => dispatch(uiBrainstormRetryGeneration({ messageId: message.id })),
    });

    const deleteBtn = button({
      id: `${ids.ROOT}-btn-delete`,
      iconId: "trash",
      style: this.style?.("buttonIcon"),
      callback: () => dispatch(messageRemoved(message.id)),
    });

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      getContent: () => {
        const msgs = currentMessages(ctx.getState().brainstorm);
        return msgs.find((m) => m.id === message.id)?.content ?? message.content;
      },
      initialDisplay: message.content || undefined,
      label: isUser ? "You" : "Brainstorm",
      placeholder: "Edit message...",
      extraControls: [retryBtn, deleteBtn],
      onSave: (content: string) => dispatch(messageUpdated({ id: message.id, content })),
    });

    // Reactive: update view text when message content changes (streaming + completion)
    ctx.bindPart(
      `${ids.TEXT}-view`,
      (state) => currentMessages(state.brainstorm).find((m) => m.id === message.id)?.content,
      (content) => ({ text: content ?? message.content }),
    );

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
          content: [editable],
        }),
      ],
    });
  },
});
