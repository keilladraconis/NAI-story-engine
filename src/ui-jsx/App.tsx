// Root of the JSX/Preact Story Engine UI. Rendered into the sidebar jsx part.
// h/Fragment are NAI-runtime globals (see external/jsx-typings.d.ts) — no import.

import { Foundation } from "./panels/Foundation";
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
        if (action.payload.chat.type === "refine") setTab("chat");
      }),
      store.subscribeEffect(matchesAction(chatSwitched), (action, { getState }) => {
        const c = getState().chat.chats.find((x) => x.id === action.payload.id);
        if (c?.type === "refine") setTab("chat");
      }),
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
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <div style={{ display: "flex" }}>
        <button style={tabButtonStyle(tab === "chat")} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button
          style={tabButtonStyle(tab === "engine")}
          onClick={() => setTab("engine")}
        >
          Story Engine
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
        {tab === "chat" ? <Chat onBack={() => setTab("engine")} /> : <Foundation />}
      </div>
    </div>
  );
}
