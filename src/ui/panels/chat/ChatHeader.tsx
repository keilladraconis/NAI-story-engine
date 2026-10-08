// src/ui/panels/chat/ChatHeader.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  chatCreated,
  chatSwitched,
  subModeChanged,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import { scenarioMode } from "../../../core/chat-types/scenario";
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
    return c ? `${c.id}|${c.title}|${c.type}|${c.subMode ?? ""}` : "";
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
      case "modeToggle": {
        const mode = scenarioMode(chat);
        return (
          <div key={c.id} style={{ display: "flex" }}>
            {(["plan", "build"] as const).map((m) => (
              <button
                key={m}
                title={
                  m === "plan"
                    ? "Talk the scenario through. Builds nothing."
                    : "Record what you've discussed as drafts and Threads."
                }
                onClick={() =>
                  store.dispatch(subModeChanged({ id: chat.id, subMode: m }))
                }
                style={{
                  background: mode === m ? "rgba(255,255,255,0.12)" : "none",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: m === "plan" ? "6px 0 0 6px" : "0 6px 6px 0",
                  color: T.text,
                  opacity: mode === m ? 1 : 0.55,
                  cursor: "pointer",
                  fontFamily: T.fontDefault,
                  fontSize: "0.75em",
                  fontWeight: mode === m ? "bold" : "normal",
                  padding: "2px 8px",
                }}
              >
                {m === "plan" ? "Plan" : "Build"}
              </button>
            ))}
          </div>
        );
      }
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
