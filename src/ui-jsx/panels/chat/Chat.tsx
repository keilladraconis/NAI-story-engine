// src/ui-jsx/panels/chat/Chat.tsx
import { useSlice } from "../../bridge";
import { SP } from "../../style";
import { store, activeSavedChat } from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { Sessions } from "./Sessions";

// Primitive re-render key: chat identity + message-id sequence. Streaming
// content changes are handled inside each Message (its own useSlice), so the
// shell does NOT rebuild per token.
function visibleChatKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return c.id + "::" + c.messages.map((m) => m.id).join(",");
}

export function Chat(props: { onBack: () => void }) {
  const key = useSlice(visibleChatKey);
  const [showSessions, setShowSessions] = useState(false);
  // Scroll the list to the bottom whenever the message set changes (new turn).
  // Source-order render in a normal column keeps messages chronological and
  // avoids the keyed-reconciliation glitch that `.reverse()` + `column-reverse`
  // produced when a new turn was inserted at the array front.
  const listRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(
    null,
  );
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [key]);

  if (!key) return null;
  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;

  if (showSessions) {
    return <Sessions onBack={() => setShowSessions(false)} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <ChatHeader onBack={props.onBack} onOpenSessions={() => setShowSessions(true)} />
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: SP.md,
        }}
      >
        {chat.messages.map((m) => (
          <Message key={m.id} chatId={chat.id} message={m} />
        ))}
      </div>
      <ChatInput />
    </div>
  );
}
