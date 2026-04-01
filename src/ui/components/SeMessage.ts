/**
 * SeMessage — SUI replacement for brainstorm/Message.ts
 *
 * Renders a single chat bubble. Wraps SeEditableText with retry + delete buttons.
 * The SeEditableText liveSelector keeps the view text live during streaming.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  messageRemoved,
  messageUpdated,
  uiBrainstormRetryGeneration,
} from "../../core/store";
import { currentMessages } from "../../core/store/slices/brainstorm";
import type { BrainstormMessage } from "../../core/store/types";
import { SeEditableText } from "./SeEditableText";

type SeMessageTheme = { default: { self: { style: object } } };
type SeMessageState = Record<string, never>;

export type SeMessageOptions = {
  message: BrainstormMessage;
} & SuiComponentOptions<SeMessageTheme, SeMessageState>;

const BUBBLE_STYLES = {
  rootUser:      { width: "100%", "justify-content": "flex-end" },
  rootAssistant: { width: "100%", "justify-content": "flex-start" },
  bubbleUser:    { padding: "10px", width: "85%", border: "none", "background-color": "rgba(64,156,255,0.2)",   "border-radius": "12px 12px 0 12px" },
  bubbleAsst:    { padding: "10px", width: "85%", border: "none", "background-color": "rgba(255,255,255,0.05)", "border-radius": "12px 12px 12px 0" },
  btn:           { padding: "4px" },
} as const;

export class SeMessage extends SuiComponent<SeMessageTheme, SeMessageState, SeMessageOptions, UIPartRow> {
  /** Expose SeEditableText so BrainstormPane can call build() cleanly. */
  private readonly _editable: SeEditableText;

  constructor(options: SeMessageOptions) {
    super(
      { state: {} as SeMessageState, ...options },
      { default: { self: { style: {} } } },
    );
    const { message } = options;
    const isUser = message.role === "user";

    this._editable = new SeEditableText({
      id:             `${options.id ?? `se-bs-msg-${message.id}`}-text`,
      label:          isUser ? "You" : "Brainstorm",
      placeholder:    "Edit message...",
      getContent:     () => currentMessages(store.getState().brainstorm).find(m => m.id === message.id)?.content ?? message.content,
      initialDisplay: message.content || undefined,
      liveSelector:   (s) => currentMessages(s.brainstorm).find(m => m.id === message.id)?.content ?? message.content,
      onSave:         (content) => store.dispatch(messageUpdated({ id: message.id, content })),
      extraControls:  [
        api.v1.ui.part.button({ id: `se-bs-msg-${message.id}-retry`,  iconId: "rotate-cw" as IconId, style: BUBBLE_STYLES.btn, callback: () => store.dispatch(uiBrainstormRetryGeneration({ messageId: message.id })) }),
        api.v1.ui.part.button({ id: `se-bs-msg-${message.id}-delete`, iconId: "trash"     as IconId, style: BUBBLE_STYLES.btn, callback: () => store.dispatch(messageRemoved(message.id)) }),
      ],
    });
  }

  async compose(): Promise<UIPartRow> {
    const { message } = this.options;
    const isUser = message.role === "user";
    const { row, column } = api.v1.ui.part;

    const editablePart = await this._editable.build();

    return row({
      id:    this.id,
      style: isUser ? BUBBLE_STYLES.rootUser : BUBBLE_STYLES.rootAssistant,
      content: [
        column({
          style:   isUser ? BUBBLE_STYLES.bubbleUser : BUBBLE_STYLES.bubbleAsst,
          content: [editablePart],
        }),
      ],
    });
  }
}
