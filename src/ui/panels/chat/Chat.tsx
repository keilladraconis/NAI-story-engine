// src/ui/panels/chat/Chat.tsx
import { useSlice } from "../../bridge";
import { SP } from "../../style";
import { store, activeSavedChat } from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { Sessions } from "./Sessions";
import { RefineCommitBar } from "./RefineCommitBar";
import { ForgeCommitBar } from "./ForgeCommitBar";

// Identity + message-id sequence (NO content). Drives the shell: it re-renders
// only when the chat switches or a message is added/removed — NOT per streaming
// token — so the composer and its native listener stay stable during a stream.
function idKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return c.id + "::" + c.messages.map((m) => m.id).join(",");
}

// Identity + per-message content length. Drives the message list only, so every
// bubble reflects the latest text even when it mounted during a list re-render.
function contentKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return (
    c.id + "::" + c.messages.map((m) => `${m.id}:${m.content.length}`).join(",")
  );
}

function MessageList() {
  useSlice(contentKey); // re-render on content change so bubbles update live

  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;
  // Match SUI (ChatPanel): a `column-reverse` scroller — the first child sits at
  // the bottom and the scroll stays pinned there as new turns arrive, with no DOM
  // scroll access needed. Messages are reversed so newest is the first child.
  //
  // Keyed by INDEX, not message id: this renderer's keyed reconciliation
  // mishandles the insert-at-front that reversing causes on each new message
  // (it scrambles the order). Index keys make Preact patch positionally — the
  // same effect as SUI rebuilding the list — so order stays correct. (SUI has no
  // keyed diffing at all; index keys are the closest JSX equivalent.)
  const reversed = chat.messages.slice().reverse();
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column-reverse",
        justifyContent: "flex-start",
        gap: "10px",
        padding: SP.md,
      }}
    >
      {reversed.map((m, i) => (
        <Message key={i} chatId={chat.id} chat={chat} message={m} />
      ))}
    </div>
  );
}

export function Chat(props: { onBack: () => void }) {
  const key = useSlice(idKey);
  const [showSessions, setShowSessions] = useState(false);
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
        flex: 1,
        minHeight: 0,
      }}
    >
      <ChatHeader
        onBack={props.onBack}
        onOpenSessions={() => setShowSessions(true)}
      />
      <MessageList />
      <ChatInput />
      {chat.type === "refine" && <RefineCommitBar />}
      {chat.type === "forge" && <ForgeCommitBar onEnd={props.onBack} />}
    </div>
  );
}
