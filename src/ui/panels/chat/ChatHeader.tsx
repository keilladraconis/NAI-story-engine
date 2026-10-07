// src/ui/panels/chat/ChatHeader.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  chatCreated,
  chatSwitched,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { nextScenarioTitle } from "./chat-actions";
import { Plus, Folder, ArrowLeft } from "nai:icons/feather";

const ICON = 16;

const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "4px",
  display: "flex",
  alignItems: "center",
} as const;

type ChatHeaderProps = { onBack: () => void; onOpenSessions: () => void };

export function ChatHeader(props: ChatHeaderProps) {
  // Re-render on title / type / id changes.
  const stamp = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? `${c.id}|${c.title}|${c.type}` : "";
  });
  const scrubbing = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return !!c && (s.forge.pendingScrubByChatId[c.id]?.length ?? 0) > 0;
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
      case "newChatButton":
        return (
          <button
            key={c.id}
            style={iconBtn}
            title="New chat"
            onClick={() => {
              const newChat: ChatT = {
                id: api.v1.uuid(),
                type: "scenario",
                title: nextScenarioTitle(store.getState().chat.chats),
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
          <button
            key={c.id}
            style={iconBtn}
            title="Sessions"
            onClick={props.onOpenSessions}
          >
            <Folder size={ICON} />
          </button>
        );
      case "scrubIndicator":
        return scrubbing ? (
          <span
            key={c.id}
            style={{ fontSize: "0.7em", fontStyle: "italic", opacity: 0.6 }}
          >
            scrubbing…
          </span>
        ) : null;
      default:
        // label (title already rendered)
        return null;
    }
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SP.sm,
        padding: SP.md,
      }}
    >
      {hasBack && (
        <button style={iconBtn} title="Back" onClick={props.onBack}>
          <ArrowLeft size={ICON} />
        </button>
      )}
      <span
        style={{
          flex: 1,
          color: T.textHeadings,
          fontWeight: "bold",
          fontSize: "0.85em",
        }}
      >
        {chat.title}
      </span>
      {trailing}
    </div>
  );
}
