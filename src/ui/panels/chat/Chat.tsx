// src/ui/panels/chat/Chat.tsx
import { useSlice } from "../../bridge";
import { matchesAction } from "nai-store";
import { SP, T } from "../../style";
import {
  store,
  activeSavedChat,
  uiChatSubmitUserMessage,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { Sessions } from "./Sessions";
import { RefineCommitBar } from "./RefineCommitBar";
import { pageWindow } from "./paging";

// Identity + message-id sequence (NO content). Drives the shell: it re-renders
// only when the chat switches or a message is added/removed — NOT per streaming
// token — so the composer and its native listener stay stable during a stream.
function idKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return c.id + "::" + c.messages.map((m) => m.id).join(",");
}

const loadMoreStyle = {
  alignSelf: "center",
  padding: "4px 12px",
  fontSize: "0.8em",
  background: T.bg2,
  border: "none",
  cursor: "pointer",
  color: T.text,
} as const;

function MessageList() {
  // Where the writer is looking: pages back from the newest, for one chat.
  // Held with the chat's id so switching chats starts at the newest page
  // without an effect to reset it.
  const [page, setPage] = useState({ chatId: "", back: 0 });

  // Sending always returns to the end — including an empty send, which in
  // Build builds what was discussed. Both go through this one action.
  useEffect(
    () =>
      store.subscribeEffect(matchesAction(uiChatSubmitUserMessage), () =>
        setPage((p) => (p.back === 0 ? p : { ...p, back: 0 })),
      ),
    [],
  );

  // Re-render on a change to what is SHOWN: identity, length, and the content
  // length of the messages in the window. Keyed over the window, not the whole
  // chat, so the cost of a streaming token does not grow with the transcript.
  useSlice((s: RootState) => {
    const c = activeSavedChat(s.chat);
    if (!c) return "";
    const back = page.chatId === c.id ? page.back : 0;
    const w = pageWindow(c.messages.length, back);
    return (
      `${c.id}::${c.messages.length}::` +
      c.messages
        .slice(w.start, w.end)
        .map((m) => `${m.id}:${m.content.length}`)
        .join(",")
    );
  });

  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;
  const w = pageWindow(
    chat.messages.length,
    page.chatId === chat.id ? page.back : 0,
  );
  const go = (back: number) => setPage({ chatId: chat.id, back });

  // A `column-reverse` scroller: the first child sits at the bottom and the
  // scroll stays pinned there as new turns arrive, with no DOM scroll access.
  // Messages are reversed so the newest shown is the first message child.
  //
  // Keyed by INDEX, not message id: this renderer's keyed reconciliation
  // mishandles the insert-at-front that reversing causes on each new message.
  //
  // Both load-more buttons are always mounted and toggled with `display`: this
  // list re-renders from store subscriptions, and a conditionally rendered
  // element is left behind by a render that did not start in a JSX event.
  const reversed = chat.messages.slice(w.start, w.end).reverse();
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
      <button
        style={{ ...loadMoreStyle, display: w.hasNewer ? "block" : "none" }}
        onClick={() => go(w.back - 1)}
      >
        Load newer
      </button>
      <div
        style={{
          display: "flex",
          flexDirection: "column-reverse",
          gap: "10px",
        }}
      >
        {reversed.map((m, i) => (
          <Message key={i} chatId={chat.id} chat={chat} message={m} />
        ))}
      </div>
      <button
        style={{ ...loadMoreStyle, display: w.hasOlder ? "block" : "none" }}
        onClick={() => go(w.back + 1)}
      >
        Load older
      </button>
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
    </div>
  );
}
