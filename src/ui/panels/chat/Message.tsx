// src/ui/panels/chat/Message.tsx
import { useSlice, useStream } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  messageUpdated,
  messageRemoved,
  uiChatRetryGeneration,
  scenarioTurnUndoRequested,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import type { ChatMessage } from "../../../core/chat-types/types";
import {
  hasStandingCommands,
  latestUndoable,
} from "../../../core/chat-types/undo";
import { ConfirmButton } from "../../components/ConfirmButton";
import { BuildPills } from "./BuildPills";
import { buildPills } from "../../../core/chat-types/pills";
import { Edit, RotateCw, RotateCcw, X, Check } from "nai:icons/feather";

type MessageProps = { chatId: string; message: ChatMessage };

const ICON = 14;
// Separation between the ordinary actions and Delete, so a mis-aimed tap at the
// edge of the bubble hits dead space rather than the destructive control.
const DESTRUCTIVE_GAP = "14px";

function readContent(s: RootState, chatId: string, msg: ChatMessage): string {
  return (
    s.chat.chats
      .find((c) => c.id === chatId)
      ?.messages.find((m) => m.id === msg.id)?.content ?? msg.content
  );
}

function readMessage(
  s: RootState,
  chatId: string,
  id: string,
): ChatMessage | undefined {
  return s.chat.chats
    .find((c) => c.id === chatId)
    ?.messages.find((m) => m.id === id);
}

const BUBBLE = {
  rowUser: { width: "100%", justifyContent: "flex-end", display: "flex" },
  rowAsst: { width: "100%", justifyContent: "flex-start", display: "flex" },
  rowSystem: { width: "100%", justifyContent: "center", display: "flex" },
  bubbleUser: {
    padding: SP.md,
    width: "85%",
    background: "rgba(64,156,255,0.2)",
    borderRadius: "12px 12px 0 12px",
    whiteSpace: "pre-wrap",
  },
  bubbleAsst: {
    padding: SP.md,
    width: "85%",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px 12px 12px 0",
    whiteSpace: "pre-wrap",
  },
  bubbleSystem: {
    padding: "8px 10px",
    width: "92%",
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "6px",
    opacity: 0.8,
    fontStyle: "italic",
    whiteSpace: "pre-wrap",
  },
} as const;

const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "2px",
  display: "flex",
  alignItems: "center",
} as const;

function EditBody(props: {
  chatId: string;
  message: ChatMessage;
  content: string;
  onDone: () => void;
}) {
  const { value, setValue } = useDraftField(props.content);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <textarea
        rows={4}
        onInput={(e) => setValue(e.target.value ?? "")}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.sm,
          border: "none",
          resize: "vertical",
        }}
      >
        {props.content}
      </textarea>
      <div style={{ display: "flex", gap: SP.sm }}>
        <button
          style={iconBtn}
          title="Save"
          onClick={() => {
            store.dispatch(
              messageUpdated({
                chatId: props.chatId,
                id: props.message.id,
                content: value,
              }),
            );
            props.onDone();
          }}
        >
          <Check size={ICON} />
        </button>
        <button style={iconBtn} title="Cancel" onClick={props.onDone}>
          <X size={ICON} />
        </button>
      </div>
    </div>
  );
}

export function Message(props: MessageProps) {
  const { chatId, message } = props;
  const committed = useSlice((s) => readContent(s, chatId, message));
  // While this message is generating, its text lives in the effect-free stream
  // buffer (per-token store dispatch wedges the render flush); fall back to the
  // committed store value once streaming clears the buffer on completion.
  const live = useStream(message.id);
  const content = live ?? committed;
  // Read from the store, not the prop: the segments arrive when the turn
  // completes, after this row was last handed its message. Both selectors
  // return what the store holds (a stable reference or a primitive).
  const mode = useSlice((s) => readMessage(s, chatId, message.id)?.mode);
  const segments = useSlice(
    (s) => readMessage(s, chatId, message.id)?.forgeSegments,
  );
  const undone = useSlice((s) => !!readMessage(s, chatId, message.id)?.undone);
  // Only the latest Build reply still standing can be undone: later turns may
  // have built on earlier ones.
  const canUndo = useSlice((s) => {
    const c = s.chat.chats.find((x) => x.id === chatId);
    return !!c && latestUndoable(c.messages)?.id === message.id;
  });
  const isBuild = message.role === "assistant" && mode === "build";
  // True only while this message is being generated: its request is the
  // active one or queued, and not cancelled. A failed, cancelled or edited
  // reply is not "thinking…".
  const generating = useSlice((s) =>
    [s.runtime.activeRequest, ...s.runtime.queue].some(
      (r) => !!r && r.status !== "cancelled" && r.targetId === message.id,
    ),
  );
  // Editing drops a reply's settled segments, and with them the record of how
  // to undo it. Edit stays hidden on every reply whose commands still stand,
  // not only the latest: editing an older one would erase the records it needs
  // once the later turns are undone.
  const standing = useSlice((s) => {
    const m = readMessage(s, chatId, message.id);
    return !!m && hasStandingCommands(m);
  });
  const canEdit = !standing;
  const pills = isBuild ? buildPills(content, segments, generating) : [];
  // Pills are keyed by position, so the key changes with the list's shape:
  // settling the segments or a different pill count collapses everything.
  const pillsKey = `${message.id}|${segments ? "s" : "p"}|${pills.length}`;
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  // Retry and Delete destroy data with no undo, so both are ConfirmButtons,
  // which disarm via resetKey when this instance is reused for another message
  // (MessageList keys by index, deliberately).
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const rowStyle = isSystem
    ? BUBBLE.rowSystem
    : isUser
      ? BUBBLE.rowUser
      : BUBBLE.rowAsst;
  const bubbleStyle = isSystem
    ? BUBBLE.bubbleSystem
    : isUser
      ? BUBBLE.bubbleUser
      : BUBBLE.bubbleAsst;

  // System "Context" bubbles: collapsed by default, expandable, delete only.
  if (isSystem) {
    return (
      <div style={rowStyle}>
        <div style={{ ...bubbleStyle, color: T.text }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              style={{ ...iconBtn, fontStyle: "italic" }}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "▸ Context" : "▾ Context"}
            </button>
            <ConfirmButton
              title="Delete"
              size={ICON}
              resetKey={message.id}
              onConfirm={() =>
                store.dispatch(messageRemoved({ chatId, id: message.id }))
              }
            />
          </div>
          {!collapsed && <div style={{ marginTop: SP.sm }}>{content}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <div style={{ ...bubbleStyle, color: T.text }}>
        {editing ? (
          <EditBody
            chatId={chatId}
            message={message}
            content={content}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
            {/* Header row: role label left, non-destructive actions right, then
                Delete alone at the far edge. The DESTRUCTIVE_GAP keeps it clear
                of Edit/Retry so a mis-aimed tap lands on nothing. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: SP.sm,
              }}
            >
              <span style={{ flex: 1, fontSize: "0.72em", opacity: 0.55 }}>
                {isUser
                  ? "You"
                  : mode === "build"
                    ? undone
                      ? "Build (undone)"
                      : "Build"
                    : mode === "plan"
                      ? "Plan"
                      : "Assistant"}
              </span>
              <div style={{ display: "flex", gap: SP.xs }}>
                <div style={{ display: canUndo ? "flex" : "none" }}>
                  <ConfirmButton
                    title="Undo this turn: removes what it built and restores what it changed. Separate from NovelAI's undo. Lorebook text generated since for something it built is lost."
                    icon={RotateCcw}
                    size={ICON}
                    resetKey={message.id}
                    onConfirm={() =>
                      store.dispatch(
                        scenarioTurnUndoRequested({
                          chatId,
                          messageId: message.id,
                        }),
                      )
                    }
                  />
                </div>
                <button
                  style={{ ...iconBtn, display: canEdit ? "flex" : "none" }}
                  title="Edit"
                  onClick={() => setEditing(true)}
                >
                  <Edit size={ICON} />
                </button>
                {message.role === "assistant" && (
                  <ConfirmButton
                    title="Retry"
                    icon={RotateCw}
                    size={ICON}
                    resetKey={message.id}
                    onConfirm={() =>
                      store.dispatch(
                        uiChatRetryGeneration({
                          chatId,
                          messageId: message.id,
                        }),
                      )
                    }
                  />
                )}
              </div>
              <div style={{ marginLeft: DESTRUCTIVE_GAP, display: "flex" }}>
                <ConfirmButton
                  title={
                    standing
                      ? "Delete this reply. What it built stays in the World and can no longer be undone from here."
                      : "Delete"
                  }
                  size={ICON}
                  resetKey={message.id}
                  onConfirm={() =>
                    store.dispatch(messageRemoved({ chatId, id: message.id }))
                  }
                />
              </div>
            </div>
            <div style={{ display: isBuild ? "none" : "block" }}>
              {content || "…"}
            </div>
            <BuildPills pills={pills} hidden={!isBuild} resetKey={pillsKey} />
          </div>
        )}
      </div>
    </div>
  );
}
