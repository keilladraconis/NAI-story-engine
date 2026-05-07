/**
 * SeMessage — chat bubble for a single ChatMessage in a chat-slice chat.
 *
 * Wraps SeEditableText with retry + delete buttons. The liveSelector keeps the
 * view text live during streaming. The hosting panel passes both the chat id
 * and the message so this component can dispatch chat-slice actions correctly
 * for either a saved chat or the currently open refineChat.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiChatRetryGeneration } from "../../core/store";
import { messageRemoved, messageUpdated } from "../../core/store/slices/chat";
import type { ChatMessage } from "../../core/chat-types/types";
import { SeEditableText } from "./SeEditableText";

type SeMessageTheme = { default: { self: { style: object } } };
type SeMessageState = Record<string, never>;

export type SeMessageOptions = {
  chatId: string;
  message: ChatMessage;
} & SuiComponentOptions<SeMessageTheme, SeMessageState>;

const BUBBLE_STYLES = {
  rootUser: { width: "100%", "justify-content": "flex-end" },
  rootAssistant: { width: "100%", "justify-content": "flex-start" },
  rootSystem: { width: "100%", "justify-content": "center" },
  bubbleUser: {
    padding: "10px",
    width: "85%",
    border: "none",
    "background-color": "rgba(64,156,255,0.2)",
    "border-radius": "12px 12px 0 12px",
  },
  bubbleAsst: {
    padding: "10px",
    width: "85%",
    border: "none",
    "background-color": "rgba(255,255,255,0.05)",
    "border-radius": "12px 12px 12px 0",
  },
  bubbleSystem: {
    padding: "8px 10px",
    width: "92%",
    border: "1px dashed rgba(255,255,255,0.18)",
    "background-color": "rgba(255,255,255,0.02)",
    "border-radius": "6px",
    opacity: "0.8",
    "font-style": "italic",
  },
  btn: { padding: "4px" },
} as const;

export class SeMessage extends SuiComponent<
  SeMessageTheme,
  SeMessageState,
  SeMessageOptions,
  UIPartRow
> {
  private readonly _editable: SeEditableText;

  constructor(options: SeMessageOptions) {
    super(
      { state: {} as SeMessageState, ...options },
      { default: { self: { style: {} } } },
    );
    const { chatId, message } = options;
    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    const findContent = (chats: { id: string; messages: ChatMessage[] }[]) =>
      chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === message.id)
        ?.content ?? message.content;

    const deleteBtn = api.v1.ui.part.button({
      id: `se-bs-msg-${message.id}-delete`,
      iconId: "trash" as IconId,
      style: BUBBLE_STYLES.btn,
      callback: () =>
        store.dispatch(messageRemoved({ chatId, id: message.id })),
    });

    const extraControls = isSystem
      ? [deleteBtn]
      : [
          api.v1.ui.part.button({
            id: `se-bs-msg-${message.id}-retry`,
            iconId: "rotate-cw" as IconId,
            style: BUBBLE_STYLES.btn,
            callback: () =>
              store.dispatch(
                uiChatRetryGeneration({ chatId, messageId: message.id }),
              ),
          }),
          deleteBtn,
        ];

    this._editable = new SeEditableText({
      id: `${options.id ?? `se-bs-msg-${message.id}`}-text`,
      label: isUser ? "You" : isSystem ? "Context" : "Assistant",
      placeholder: "Edit message...",
      getContent: () => {
        const s = store.getState();
        if (s.chat.refineChat?.id === chatId) {
          return (
            s.chat.refineChat.messages.find((m) => m.id === message.id)
              ?.content ?? message.content
          );
        }
        return findContent(s.chat.chats);
      },
      initialDisplay: message.content || undefined,
      liveSelector: (s) => {
        if (s.chat.refineChat?.id === chatId) {
          return (
            s.chat.refineChat.messages.find((m) => m.id === message.id)
              ?.content ?? message.content
          );
        }
        return findContent(s.chat.chats);
      },
      onSave: (content) =>
        store.dispatch(messageUpdated({ chatId, id: message.id, content })),
      extraControls,
    });
  }

  async compose(): Promise<UIPartRow> {
    const { message } = this.options;
    const isUser = message.role === "user";
    const isSystem = message.role === "system";
    const { row, column } = api.v1.ui.part;

    const editablePart = await this._editable.build();

    const rootStyle = isSystem
      ? BUBBLE_STYLES.rootSystem
      : isUser
        ? BUBBLE_STYLES.rootUser
        : BUBBLE_STYLES.rootAssistant;
    const bubbleStyle = isSystem
      ? BUBBLE_STYLES.bubbleSystem
      : isUser
        ? BUBBLE_STYLES.bubbleUser
        : BUBBLE_STYLES.bubbleAsst;

    return row({
      id: this.id,
      style: rootStyle,
      content: [
        column({
          style: bubbleStyle,
          content: [editablePart],
        }),
      ],
    });
  }
}
