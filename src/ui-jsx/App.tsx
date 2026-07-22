// Root of the JSX/Preact Story Engine UI. Rendered into the sidebar jsx part.
// h/Fragment are NAI-runtime globals (see external/jsx-typings.d.ts) — no import.

import { StoryEngine } from "./panels/StoryEngine";
import { Chat } from "./panels/chat/Chat";
import { T, SP } from "./style";
import {
  store,
  chatCreated,
  chatSwitched,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
} from "../core/store";
import { matchesAction } from "nai-store";

type Tab = "chat" | "engine";

function tabButtonStyle(active: boolean) {
  return {
    flex: 1,
    padding: SP.md,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: active ? T.textHeadings : T.textDisabled,
    fontWeight: active ? "bold" : "normal",
    borderBottom: active
      ? `2px solid ${T.textHeadings}`
      : "2px solid transparent",
  };
}

export function App() {
  const [tab, setTab] = useState<Tab>("engine");

  // Mirror the SUI plugin's tab-switch effects, local to the JSX panel:
  // a refine opening surfaces the Chat tab; commit/discard returns to Engine.
  useEffect(() => {
    const unsubs = [
      store.subscribeEffect(matchesAction(chatCreated), (action) => {
        if (
          action.payload.chat.type === "refine" ||
          action.payload.chat.type === "forge"
        )
          setTab("chat");
      }),
      store.subscribeEffect(
        matchesAction(chatSwitched),
        (action, { getState }) => {
          const c = getState().chat.chats.find(
            (x) => x.id === action.payload.id,
          );
          if (c?.type === "refine" || c?.type === "forge") setTab("chat");
        },
      ),
      store.subscribeEffect(matchesAction(uiChatRefineCommitted), () =>
        setTab("engine"),
      ),
      store.subscribeEffect(matchesAction(uiChatRefineDiscarded), () =>
        setTab("engine"),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        color: T.text,
        fontFamily: T.fontDefault,
        // The shadow root resets scrollbars to the browser default; `scrollbar-*`
        // are inherited, so setting them here restyles every scroller in the tree.
        scrollbarWidth: "thin",
        scrollbarColor: `${T.bg3} transparent`,
      }}
    >
      <div style={{ display: "flex" }}>
        <button
          style={tabButtonStyle(tab === "chat")}
          onClick={() => setTab("chat")}
        >
          Chat
        </button>
        <button
          style={tabButtonStyle(tab === "engine")}
          onClick={() => setTab("engine")}
        >
          Story Engine
        </button>
      </div>
      {/* Chat manages its own scroll + pins its composer, so it gets an
          unpadded bounded flex box; the Story Engine tab keeps padding/scroll. */}
      {tab === "chat" ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Chat onBack={() => setTab("engine")} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
          <StoryEngine />
        </div>
      )}
    </div>
  );
}
