// src/ui-jsx/panels/chat/Message.tsx
import { useSlice } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  messageUpdated,
  messageRemoved,
  uiChatRetryGeneration,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import type { ChatMessage } from "../../../core/chat-types/types";
import { Edit, RotateCw, Trash, X, Check } from "nai:icons/feather";

type MessageProps = { chatId: string; message: ChatMessage };

const ICON = 14;

function readContent(s: RootState, chatId: string, msg: ChatMessage): string {
  return (
    s.chat.chats
      .find((c) => c.id === chatId)
      ?.messages.find((m) => m.id === msg.id)?.content ?? msg.content
  );
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

function EditBody(props: { chatId: string; message: ChatMessage; content: string; onDone: () => void }) {
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
              messageUpdated({ chatId: props.chatId, id: props.message.id, content: value }),
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
  const content = useSlice((s) => readContent(s, chatId, message));
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const rowStyle = isSystem ? BUBBLE.rowSystem : isUser ? BUBBLE.rowUser : BUBBLE.rowAsst;
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              style={{ ...iconBtn, fontStyle: "italic" }}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "▸ Context" : "▾ Context"}
            </button>
            <button
              style={iconBtn}
              title="Delete"
              onClick={() => store.dispatch(messageRemoved({ chatId, id: message.id }))}
            >
              <Trash size={ICON} />
            </button>
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
          <EditBody chatId={chatId} message={message} content={content} onDone={() => setEditing(false)} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
            <div>{content || "…"}</div>
            <div style={{ display: "flex", gap: SP.sm, justifyContent: "flex-end" }}>
              <button style={iconBtn} title="Edit" onClick={() => setEditing(true)}>
                <Edit size={ICON} />
              </button>
              {message.role === "assistant" && (
                <button
                  style={iconBtn}
                  title="Retry"
                  onClick={() =>
                    store.dispatch(uiChatRetryGeneration({ chatId, messageId: message.id }))
                  }
                >
                  <RotateCw size={ICON} />
                </button>
              )}
              <button
                style={iconBtn}
                title="Delete"
                onClick={() => store.dispatch(messageRemoved({ chatId, id: message.id }))}
              >
                <Trash size={ICON} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
