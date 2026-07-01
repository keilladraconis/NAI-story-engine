// src/ui-jsx/panels/chat/Chat.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, activeSavedChat } from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";

// Primitive re-render key: chat identity + message-id sequence. Streaming
// content changes are handled inside each Message (its own useSlice), so the
// shell does NOT rebuild per token.
function visibleChatKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return c.id + "::" + c.messages.map((m) => m.id).join(",");
}

export function Chat() {
  const key = useSlice(visibleChatKey);
  if (!key) return null;
  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <div style={{ color: T.textHeadings, fontWeight: "bold", padding: SP.md }}>
        {chat.title}
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column-reverse",
          justifyContent: "flex-start",
          gap: "10px",
          padding: SP.md,
        }}
      >
        {chat.messages
          .map((m) => <Message key={m.id} chatId={chat.id} message={m} />)
          .reverse()}
      </div>
      <ChatInput />
    </div>
  );
}
