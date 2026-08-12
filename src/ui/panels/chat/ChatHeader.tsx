// src/ui/panels/chat/ChatHeader.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  chatCreated,
  chatSwitched,
  subModeChanged,
  uiChatSummarizeRequested,
  forgeNextPhasePinned,
} from "../../../core/store";
import {
  selectForgeNextPhase,
  selectForgeDraftPoolCount,
} from "../../../core/store/selectors/forge";
import { getChatTypeSpec } from "../../../core/chat-types";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { nextBrainstormTitle } from "./chat-actions";
import { useTapGuards } from "../../tap-guard";
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
    border: active
      ? "1px solid rgba(255,255,255,0.2)"
      : "1px solid rgba(255,255,255,0.08)",
    opacity: active ? 1 : 0.5,
    cursor: "pointer",
    color: T.text,
  };
}

const FORGE_PHASES: { id: "sketch" | "expand" | "weave"; label: string }[] = [
  { id: "sketch", label: "Sketch" },
  { id: "expand", label: "Expand" },
  { id: "weave", label: "Weave" },
];

function phasePillStyle(active: boolean, disabled: boolean) {
  return {
    padding: "2px 8px",
    fontSize: "0.72em",
    borderRadius: "4px",
    background: active ? "rgba(255,200,80,0.22)" : "transparent",
    border: active
      ? "1px solid rgba(255,255,255,0.2)"
      : "1px solid rgba(255,255,255,0.08)",
    opacity: disabled ? 0.3 : active ? 1 : 0.6,
    cursor: disabled ? "default" : "pointer",
    color: T.text,
  } as const;
}

type ChatHeaderProps = { onBack: () => void; onOpenSessions: () => void };

export function ChatHeader(props: ChatHeaderProps) {
  // Re-render on title / subMode / type / id changes.
  const stamp = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? `${c.id}|${c.title}|${c.subMode ?? ""}|${c.type}` : "";
  });
  const forgeNext = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? selectForgeNextPhase(s, c.id) : "sketch";
  });
  const forgePoolEmpty = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? selectForgeDraftPoolCount(s, c.id) === 0 : true;
  });
  const scrubbing = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return !!c && (s.forge.pendingScrubByChatId[c.id]?.length ?? 0) > 0;
  });
  // Every control here is one tap = one action. Sum is the one that hurt: a
  // doubled tap opened two summary chats, each with its own generation.
  // Declared above the early return so the hook count stays stable.
  const onceTap = useTapGuards();
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
              onClick={() =>
                onceTap("mode-cowriter", () =>
                  store.dispatch(
                    subModeChanged({ id: chat.id, subMode: "cowriter" }),
                  ),
                )
              }
            >
              Co
            </button>
            <button
              style={modeBtnStyle(chat.subMode === "critic", MODE_CRITIC)}
              onClick={() =>
                onceTap("mode-critic", () =>
                  store.dispatch(
                    subModeChanged({ id: chat.id, subMode: "critic" }),
                  ),
                )
              }
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
              onceTap("sum", () =>
                store.dispatch(
                  uiChatSummarizeRequested({
                    seed: { kind: "fromChat", sourceChatId: chat.id },
                  }),
                ),
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
            onClick={() =>
              onceTap("new", () => {
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
              })
            }
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
            onClick={() => onceTap("sessions", props.onOpenSessions)}
          >
            <Folder size={ICON} />
          </button>
        );
      case "phaseIndicator":
        return (
          <div
            key={c.id}
            style={{ display: "flex", gap: SP.xs }}
            title="Next forge phase"
          >
            {FORGE_PHASES.map((p) => {
              const disabled = forgePoolEmpty && p.id !== "sketch";
              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  style={phasePillStyle(forgeNext === p.id, disabled)}
                  onClick={() =>
                    onceTap(`phase-${p.id}`, () => {
                      if (!disabled)
                        store.dispatch(
                          forgeNextPhasePinned({
                            chatId: chat.id,
                            phase: p.id,
                          }),
                        );
                    })
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
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
        <button
          style={iconBtn}
          title="Back"
          onClick={() => onceTap("back", props.onBack)}
        >
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
