/**
 * ChatHeader — Renders header controls (sessions/sub-mode/summarize/label) for the
 * active chat. The control set is delegated to the chat-type spec's headerControls()
 * so each chat type (brainstorm, summary, refine) gets the right UI without branching here.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { getChatTypeSpec } from "../../core/chat-types";
import { uiChatSummarizeRequested } from "../../core/store/slices/ui";
import { subModeChanged } from "../../core/store/slices/chat";
import type { Chat } from "../../core/chat-types/types";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type ChatHeaderOptions = {
  /** Resolves the chat to render the header for; called at compose time. */
  chatProvider: () => Chat | null;
  onOpenSessions?: () => void;
} & SuiComponentOptions<Theme, State>;

export class ChatHeader extends SuiComponent<
  Theme,
  State,
  ChatHeaderOptions,
  UIPartRow
> {
  constructor(options: ChatHeaderOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
  }

  async compose(): Promise<UIPartRow> {
    const chat = this.options.chatProvider();
    const { row, button, text } = api.v1.ui.part;
    if (!chat) return row({ id: this.id, content: [] });

    const spec = getChatTypeSpec(chat.type);
    const ctx = { getState: store.getState, dispatch: store.dispatch };
    const controls = spec.headerControls(chat, ctx);

    const built = controls.map((c) => {
      switch (c.kind) {
        case "sessionsButton":
          return button({
            id: `${this.id}-sessions`,
            iconId: "folder",
            callback: () => this.options.onOpenSessions?.(),
          });
        case "subModeToggle":
          return button({
            id: `${this.id}-submode`,
            text: chat.subMode === "critic" ? "Crit" : "Co",
            callback: () =>
              store.dispatch(
                subModeChanged({
                  id: chat.id,
                  subMode: chat.subMode === "critic" ? "cowriter" : "critic",
                }),
              ),
          });
        case "summarizeButton":
          return button({
            id: `${this.id}-sum`,
            text: "Sum",
            callback: () =>
              store.dispatch(
                uiChatSummarizeRequested({
                  seed: { kind: "fromChat", sourceChatId: chat.id },
                }),
              ),
          });
        case "label":
          return text({ id: `${this.id}-label`, text: chat.title });
        default:
          return text({ id: `${this.id}-x-${c.id}`, text: "" });
      }
    });

    return row({
      id: this.id,
      style: { gap: "6px", "align-items": "center", padding: "6px" },
      content: built,
    });
  }
}
