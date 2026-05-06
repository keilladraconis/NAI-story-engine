/**
 * ChatHeader — Renders header controls (sub-mode/summarize/new/sessions/label) for the
 * active chat. Control set is delegated to the chat-type spec's headerControls() so each
 * chat type (brainstorm, summary, refine) gets the right UI without branching here.
 *
 * Co/Crit toggle is two side-by-side buttons with active highlighting (matching legacy
 * SeChatHeader UX). Title and sub-mode updates flow through StoreWatcher so the user
 * sees state changes without needing a full panel rebuild.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { getChatTypeSpec } from "../../core/chat-types";
import { uiChatSummarizeRequested } from "../../core/store/slices/ui";
import { subModeChanged, chatCreated, chatSwitched } from "../../core/store/slices/chat";
import { StoreWatcher } from "../store-watcher";
import type { Chat } from "../../core/chat-types/types";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type ChatHeaderOptions = {
  /** Resolves the chat to render the header for; called at compose time. */
  chatProvider: () => Chat | null;
  onOpenSessions?: () => void;
} & SuiComponentOptions<Theme, State>;

const MODE_ACTIVE_COWRITER = "rgba(80,200,120,0.25)";
const MODE_ACTIVE_CRITIC = "rgba(255,100,100,0.25)";

function modeButtonStyle(isActive: boolean, color: string): object {
  return {
    padding: "2px 8px",
    "font-size": "0.75em",
    "border-radius": "4px",
    "background-color": isActive ? color : "transparent",
    border: isActive
      ? "1px solid rgba(255,255,255,0.2)"
      : "1px solid rgba(255,255,255,0.08)",
    opacity: isActive ? "1" : "0.5",
  };
}

function nextBrainstormTitle(): string {
  const existing = store.getState().chat.chats.filter((c) => c.type === "brainstorm");
  return `Brainstorm ${existing.length + 1}`;
}

export class ChatHeader extends SuiComponent<
  Theme,
  State,
  ChatHeaderOptions,
  UIPartRow
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: ChatHeaderOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.dispose();
    const chat = this.options.chatProvider();
    const { row, button, text } = api.v1.ui.part;
    if (!chat) return row({ id: this.id, content: [] });

    const titleId = `${this.id}-title`;
    const coId = `${this.id}-co`;
    const critId = `${this.id}-crit`;

    // React to title + sub-mode changes without a full panel rebuild. Chat-identity
    // changes are handled by ChatPanel's outer rebuild — this watcher ignores them.
    this._watcher.watch(
      (s) => {
        const active =
          s.chat.refineChat ?? s.chat.chats.find((c) => c.id === s.chat.activeChatId);
        return {
          id: active?.id ?? null,
          title: active?.title ?? "",
          subMode: active?.subMode ?? null,
        };
      },
      ({ id, title, subMode }) => {
        if (id !== chat.id) return;
        api.v1.ui.updateParts([
          { id: titleId, text: title },
          {
            id: coId,
            style: modeButtonStyle(subMode === "cowriter", MODE_ACTIVE_COWRITER),
          },
          {
            id: critId,
            style: modeButtonStyle(subMode === "critic", MODE_ACTIVE_CRITIC),
          },
        ]);
      },
      (a, b) => a.id === b.id && a.title === b.title && a.subMode === b.subMode,
    );

    const spec = getChatTypeSpec(chat.type);
    const ctx = { getState: store.getState, dispatch: store.dispatch };
    const controls = spec.headerControls(chat, ctx);

    const built: UIPart[] = [
      text({
        id: titleId,
        text: chat.title,
        style: { flex: "1", "font-size": "0.85em", opacity: "0.8" },
      }),
    ];

    for (const c of controls) {
      switch (c.kind) {
        case "subModeToggle":
          built.push(
            button({
              id: coId,
              text: "Co",
              style: modeButtonStyle(chat.subMode === "cowriter", MODE_ACTIVE_COWRITER),
              callback: () =>
                store.dispatch(subModeChanged({ id: chat.id, subMode: "cowriter" })),
            }),
            button({
              id: critId,
              text: "Crit",
              style: modeButtonStyle(chat.subMode === "critic", MODE_ACTIVE_CRITIC),
              callback: () =>
                store.dispatch(subModeChanged({ id: chat.id, subMode: "critic" })),
            }),
          );
          break;
        case "summarizeButton":
          built.push(
            button({
              id: `${this.id}-sum`,
              text: "Sum",
              style: { padding: "2px 8px", "font-size": "0.75em" },
              callback: () =>
                store.dispatch(
                  uiChatSummarizeRequested({
                    seed: { kind: "fromChat", sourceChatId: chat.id },
                  }),
                ),
            }),
          );
          break;
        case "newChatButton":
          built.push(
            button({
              id: `${this.id}-new`,
              iconId: "plus",
              style: { width: "24px", padding: "4px" },
              callback: () => {
                const newChat: Chat = {
                  id: api.v1.uuid(),
                  type: "brainstorm",
                  title: nextBrainstormTitle(),
                  subMode: "cowriter",
                  messages: [],
                  seed: { kind: "blank" },
                };
                store.dispatch(chatCreated({ chat: newChat }));
                store.dispatch(chatSwitched({ id: newChat.id }));
              },
            }),
          );
          break;
        case "sessionsButton":
          built.push(
            button({
              id: `${this.id}-sessions`,
              iconId: "folder",
              style: { width: "24px", padding: "4px" },
              callback: () => this.options.onOpenSessions?.(),
            }),
          );
          break;
        case "label":
          // Title is already shown at the start of the row; no extra label needed.
          break;
        default:
          break;
      }
    }

    return row({
      id: this.id,
      style: {
        padding: "8px",
        "align-items": "center",
        gap: "6px",
        "border-bottom": "1px solid rgba(255,255,255,0.1)",
        "flex-shrink": "0",
      },
      content: built,
    });
  }
}
