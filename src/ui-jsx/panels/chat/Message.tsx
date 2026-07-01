// src/ui-jsx/panels/chat/Message.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import type { RootState } from "../../../core/store";
import type { ChatMessage } from "../../../core/chat-types/types";

type MessageProps = { chatId: string; message: ChatMessage };

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

export function Message(props: MessageProps) {
  const { chatId, message } = props;
  const content = useSlice((s) => readContent(s, chatId, message));
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
  return (
    <div style={rowStyle}>
      <div style={{ ...bubbleStyle, color: T.text }}>{content || "…"}</div>
    </div>
  );
}
