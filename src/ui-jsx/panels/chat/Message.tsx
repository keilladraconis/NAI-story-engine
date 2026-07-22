// src/ui-jsx/panels/chat/Message.tsx
import { useSlice, useStream } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  messageUpdated,
  messageRemoved,
  uiChatRetryGeneration,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import type { ChatMessage, Chat } from "../../../core/chat-types/types";
import { getChatTypeSpec } from "../../../core/chat-types";
import { EntityCard } from "../world/EntityCard";
import { Edit, RotateCw, Trash, X, Check } from "nai:icons/feather";

type MessageProps = { chatId: string; chat: Chat; message: ChatMessage };

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
  const { chatId, chat, message } = props;
  const committed = useSlice((s) => readContent(s, chatId, message));
  // While this message is generating, its text lives in the effect-free stream
  // buffer (per-token store dispatch wedges the render flush); fall back to the
  // committed store value once streaming clears the buffer on completion.
  const live = useStream(message.id);
  const content = live ?? committed;
  // Draft-entity ids for this turn (e.g. forge chats), rendered as inline cards
  // below the bubble. Non-forge chats have no `inlineEntityIdsFor`, so this is
  // inert. Must return a primitive string from useSlice — a fresh array would
  // trigger a render loop — so join/split around the selector boundary.
  const inlineKey = useSlice((s) => {
    const spec = getChatTypeSpec(chat.type);
    return (
      spec.inlineEntityIdsFor?.(message, chat, {
        getState: () => s,
        dispatch: store.dispatch,
      }) ?? []
    ).join(",");
  });
  const inlineIds = inlineKey ? inlineKey.split(",") : [];
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
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
            <button
              style={iconBtn}
              title="Delete"
              onClick={() =>
                store.dispatch(messageRemoved({ chatId, id: message.id }))
              }
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
          <EditBody
            chatId={chatId}
            message={message}
            content={content}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
            {/* Header row: role label left, actions top-right (matches SUI). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SP.sm,
              }}
            >
              <span style={{ fontSize: "0.72em", opacity: 0.55 }}>
                {isUser ? "You" : "Assistant"}
              </span>
              <div style={{ display: "flex", gap: SP.xs }}>
                <button
                  style={iconBtn}
                  title="Edit"
                  onClick={() => setEditing(true)}
                >
                  <Edit size={ICON} />
                </button>
                {message.role === "assistant" && (
                  <button
                    style={iconBtn}
                    title="Retry"
                    onClick={() =>
                      store.dispatch(
                        uiChatRetryGeneration({
                          chatId,
                          messageId: message.id,
                        }),
                      )
                    }
                  >
                    <RotateCw size={ICON} />
                  </button>
                )}
                <button
                  style={iconBtn}
                  title="Delete"
                  onClick={() =>
                    store.dispatch(messageRemoved({ chatId, id: message.id }))
                  }
                >
                  <Trash size={ICON} />
                </button>
              </div>
            </div>
            <div>{content || "…"}</div>
            {inlineIds.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: SP.xs,
                  marginTop: SP.sm,
                }}
              >
                {inlineIds.map((id) => (
                  <EntityCard key={`inline-${message.id}-${id}`} entityId={id} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
