// Root of the JSX/Preact Story Engine UI. Rendered into the sidebar jsx part.
// h/Fragment are NAI-runtime globals (see external/jsx-typings.d.ts) — no import.

import { Setup } from "./panels/setup/Setup";
import { Engine } from "./panels/Engine";
import { Chat } from "./panels/chat/Chat";
import { Header } from "./header/Header";
import { useHasDocumentContent } from "./panels/setup/use-document-content";
import { T, SP } from "./style";
import {
  TAB_ORDER,
  TAB_LABELS,
  initialTab,
  tabForActiveEdit,
  type Tab,
} from "./tabs";
import {
  store,
  chatCreated,
  chatSwitched,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  worldExpansionSet,
  importWizardOpened,
} from "../core/store";
import {
  forgeCastAllRequested,
  forgeDiscardAllRequested,
} from "../core/store/effects/forge-chat-effects";
import { matchesAction } from "nai-store";

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

export function App(props: { initialHasDocumentContent: boolean }) {
  // The wizard's cold-start auto-open dispatches importWizardOpened from
  // mount.ts, which can land before this component's subscriptions exist — so
  // the flag also seeds the initial tab. Lazy initialiser: the store is read
  // once on mount, not on every render.
  const [tab, setTab] = useState<Tab>(() =>
    store.getState().ui.importWizardOpen
      ? "setup"
      : initialTab(props.initialHasDocumentContent),
  );

  // Hoisted out of Setup, which unmounts on every tab switch — a remount would
  // reset the seed to the startup value and briefly mislabel the button.
  const hasDocumentContent = useHasDocumentContent(
    props.initialHasDocumentContent,
  );

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
      // A refine returns to whichever tab its edit pane lives on: Foundation
      // fields are edited in Setup, entities and threads in Engine. No effect
      // clears ui.activeEditId, so it still names the pane the writer came from.
      store.subscribeEffect(
        matchesAction(uiChatRefineCommitted),
        (_action, { getState }) => {
          setTab(tabForActiveEdit(getState().ui.activeEditId));
        },
      ),
      store.subscribeEffect(
        matchesAction(uiChatRefineDiscarded),
        (_action, { getState }) => {
          setTab(tabForActiveEdit(getState().ui.activeEditId));
        },
      ),
      // Cast All closes the forge session — land on the Engine tab with the
      // World expanded so the freshly-cast entities are right there.
      store.subscribeEffect(matchesAction(forgeCastAllRequested), () => {
        setTab("engine");
        store.dispatch(worldExpansionSet({ expanded: true }));
      }),
      store.subscribeEffect(matchesAction(forgeDiscardAllRequested), () =>
        setTab("engine"),
      ),
      // The wizard renders inside Setup now — surface that tab, not Engine.
      store.subscribeEffect(matchesAction(importWizardOpened), () =>
        setTab("setup"),
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
      <Header />
      <div style={{ display: "flex", flexShrink: 0 }}>
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            style={tabButtonStyle(tab === t)}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {/* Chat manages its own scroll + pins its composer, so it gets an
          unpadded bounded flex box; the other tabs keep padding/scroll. */}
      {tab === "chat" ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Back keeps the refine alive, so it must land on the tab that owns
              the still-open edit pane — same rule the commit/discard effects
              above use. */}
          <Chat
            onBack={() =>
              setTab(tabForActiveEdit(store.getState().ui.activeEditId))
            }
          />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
          {tab === "setup" ? (
            <Setup
              hasDocumentContent={hasDocumentContent}
              onOpenChat={() => setTab("chat")}
            />
          ) : (
            <Engine />
          )}
        </div>
      )}
    </div>
  );
}
