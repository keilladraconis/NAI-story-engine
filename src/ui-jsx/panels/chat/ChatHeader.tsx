// src/ui-jsx/panels/chat/ChatHeader.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  chatCreated,
  chatSwitched,
  subModeChanged,
  uiChatSummarizeRequested,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { nextBrainstormTitle } from "./chat-actions";
import { Plus, Folder, ArrowLeft } from "nai:icons/feather";

const ICON = 16;
const MODE_COWRITER = "rgba(80,200,120,0.25)";
const MODE_CRITIC = "rgba(255,100,100,0.25)";

const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "4px",
  display: "flex",
  alignItems: "center",
} as const;

function modeBtnStyle(active: boolean, color: string) {
  return {
    padding: "2px 8px",
    fontSize: "0.75em",
    borderRadius: "4px",
    background: active ? color : "transparent",
    border: active ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)",
    opacity: active ? 1 : 0.5,
    cursor: "pointer",
    color: T.text,
  };
}

type ChatHeaderProps = { onBack: () => void; onOpenSessions: () => void };

export function ChatHeader(props: ChatHeaderProps) {
  // Re-render on title / subMode / type / id changes.
  const stamp = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? `${c.id}|${c.title}|${c.subMode ?? ""}|${c.type}` : "";
  });
  if (!stamp) return null;
  const chat = activeSavedChat(store.getState().chat)!;
  const spec = getChatTypeSpec(chat.type);
  const controls = spec.headerControls(chat, {
    getState: store.getState,
    dispatch: store.dispatch,
  });

  const hasBack = controls.some((c) => c.kind === "backButton");

  const trailing = controls.map((c) => {
    switch (c.kind) {
      case "subModeToggle":
        return (
          <div key={c.id} style={{ display: "flex", gap: SP.xs }}>
            <button
              style={modeBtnStyle(chat.subMode === "cowriter", MODE_COWRITER)}
              onClick={() => store.dispatch(subModeChanged({ id: chat.id, subMode: "cowriter" }))}
            >
              Co
            </button>
            <button
              style={modeBtnStyle(chat.subMode === "critic", MODE_CRITIC)}
              onClick={() => store.dispatch(subModeChanged({ id: chat.id, subMode: "critic" }))}
            >
              Crit
            </button>
          </div>
        );
      case "summarizeButton":
        return (
          <button
            key={c.id}
            style={{ ...modeBtnStyle(false, "transparent"), opacity: 1 }}
            onClick={() =>
              store.dispatch(
                uiChatSummarizeRequested({ seed: { kind: "fromChat", sourceChatId: chat.id } }),
              )
            }
          >
            Sum
          </button>
        );
      case "newChatButton":
        return (
          <button
            key={c.id}
            style={iconBtn}
            title="New chat"
            onClick={() => {
              const newChat: ChatT = {
                id: api.v1.uuid(),
                type: "brainstorm",
                title: nextBrainstormTitle(store.getState().chat.chats),
                subMode: "cowriter",
                messages: [],
                seed: { kind: "blank" },
              };
              store.dispatch(chatCreated({ chat: newChat }));
              store.dispatch(chatSwitched({ id: newChat.id }));
            }}
          >
            <Plus size={ICON} />
          </button>
        );
      case "sessionsButton":
        return (
          <button key={c.id} style={iconBtn} title="Sessions" onClick={props.onOpenSessions}>
            <Folder size={ICON} />
          </button>
        );
      default:
        // label (title already rendered), phaseIndicator, scrubIndicator (forge — Slice B)
        return null;
    }
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: SP.md }}>
      {hasBack && (
        <button style={iconBtn} title="Back" onClick={props.onBack}>
          <ArrowLeft size={ICON} />
        </button>
      )}
      <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold", fontSize: "0.85em" }}>
        {chat.title}
      </span>
      {trailing}
    </div>
  );
}
