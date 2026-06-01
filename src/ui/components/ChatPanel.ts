/**
 * ChatPanel — Top-level chat panel that hosts a chat (header, messages, input, optional commit bar).
 *
 * Visible chat resolution: refineChat takes precedence; else activeSavedChat.
 * Watches chat identity, refine flag, and message-id sequence; recomposes (via onRebuild
 * callback) only when one of those changes.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";
import { ChatHeader } from "./ChatHeader";
import { SeBrainstormInput } from "./SeBrainstormInput";
import { SeMessage } from "./SeMessage";
import { SeEntityCard } from "./SeEntityCard";
import { IDS } from "../../ui/framework/ids";
import { RefineCommitBar } from "./RefineCommitBar";
import type { Chat } from "../../core/chat-types/types";
import { getChatTypeSpec } from "../../core/chat-types";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type ChatPanelOptions = {
  onRebuild: () => void;
  onOpenSessions: () => void;
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

function visibleChat(state: RootState): Chat | null {
  if (state.chat.refineChat) return state.chat.refineChat;
  if (!state.chat.activeChatId) return null;
  return state.chat.chats.find((c) => c.id === state.chat.activeChatId) ?? null;
}

export class ChatPanel extends SuiComponent<
  Theme,
  State,
  ChatPanelOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _header: ChatHeader;
  private readonly _input: SeBrainstormInput;
  private readonly _commitBar: RefineCommitBar;

  constructor(options: ChatPanelOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._header = new ChatHeader({
      id: "se-chat-header",
      chatProvider: () => visibleChat(store.getState()),
      onOpenSessions: options.onOpenSessions,
    });
    this._input = new SeBrainstormInput({ id: "se-bs-input-area" });
    this._commitBar = new RefineCommitBar({ id: "se-refine-commit" });
  }

  async compose(): Promise<UIPartColumn> {
    const { onRebuild } = this.options;
    this._watcher.dispose();
    this._watcher.watch(
      (s: RootState) => {
        const v = visibleChat(s);
        return {
          id: v?.id,
          isRefine: !!s.chat.refineChat,
          msgIds: v?.messages.map((m) => m.id).join("|") ?? "",
          draftIdHash: Object.values(s.world.entitiesById)
            .filter(
              (e) => e.sourceChatId === v?.id && e.lifecycle === "draft",
            )
            .map((e) => `${e.id}:${e.lastAffectingMessageId ?? ""}`)
            .sort()
            .join("|"),
        };
      },
      () => onRebuild(),
      (a, b) =>
        a.id === b.id &&
        a.isRefine === b.isRefine &&
        a.msgIds === b.msgIds &&
        a.draftIdHash === b.draftIdHash,
    );

    const v = visibleChat(store.getState());
    const { column } = api.v1.ui.part;
    if (!v) {
      return column({ id: this.id, content: [] });
    }

    const spec = getChatTypeSpec(v.type);
    const ctx = { getState: store.getState, dispatch: store.dispatch };

    // Build each message with its inline entity cards appended. Layout is
    // column-reverse so we build in source order then reverse the resulting
    // group blocks.
    const groupParts: UIPart[] = [];
    for (const msg of v.messages) {
      const msgPart = await new SeMessage({
        id: `se-bs-msg-${msg.id}`,
        chatId: v.id,
        message: msg,
        // NOTE: command syntax is intentionally NOT stripped yet — until the
        // Phase 2 action chips exist, showing the (canonical) action lines in
        // the bubble is the only way to see a forge pass make progress.
        // Re-introduce stripForgeCommands alongside the chips.
      }).build();
      groupParts.push(msgPart);
      const inlineIds = spec.inlineEntityIdsFor?.(msg, v, ctx) ?? [];
      for (const entityId of inlineIds) {
        const cardPart = await new SeEntityCard({
          id: IDS.entity(entityId, v.id).ROOT,
          entityId,
          editHost: this.options.editHost,
        }).build();
        // Indent so the inline draft card reads as belonging to its message.
        groupParts.push(
          column({
            id: `se-inline-wrap-${v.id}-${entityId}`,
            style: { "margin-left": "12px" },
            content: [cardPart],
          }),
        );
      }
    }
    const messageParts = groupParts.reverse();
    const headerPart = await this._header.build();
    const inputPart = await this._input.build();

    const isRefine = !!store.getState().chat.refineChat;
    const footerParts = isRefine
      ? [inputPart, await this._commitBar.build()]
      : [inputPart];

    return column({
      id: this.id,
      style: { height: "100%", "justify-content": "space-between" },
      content: [
        headerPart,
        column({
          id: "se-bs-list",
          style: {
            flex: 1,
            overflow: "auto",
            "flex-direction": "column-reverse",
            "justify-content": "flex-start",
            gap: "10px",
            padding: "8px",
            "padding-bottom": "20px",
          },
          content: messageParts,
        }),
        ...footerParts,
      ],
    });
  }
}
