// Forge entry section for the JSX Story Engine tab. A guidance textarea +
// "Forge" button: resume the active forge chat (feeding guidance as a send) if
// one exists, else start a new session seeded with the guidance. Mirrors SUI
// SeForgeSection. Opening a forge chat surfaces the Chat tab (App.tsx effect).
//
// JSX inputs have NO `storageKey` binding (that is SUI-only). Follow the
// ChatInput pattern: a controlled <textarea value=…> backed by useState, seeded
// once from storyStorage and persisted on change, so the draft survives the
// panel remount that a tab switch causes.

import { T, SP } from "../../style";
import { store, chatSwitched } from "../../../core/store";
import { forgeChatNewSessionRequested } from "../../../core/store/effects/forge-chat-effects";
import { selectActiveForgeChatId } from "../../../core/store/selectors/forge";
import { getChatTypeSpec } from "../../../core/chat-types";
import { STORAGE_KEYS } from "../../../core/keys";
import { Zap } from "nai:icons/feather";

const GUIDANCE_KEY = STORAGE_KEYS.FORGE_GUIDANCE_UI;

export function ForgeSection() {
  const [guidance, setGuidance] = useState("");
  // Seed once from storyStorage (survives a tab-switch remount), like ChatInput.
  useEffect(() => {
    void (async () => {
      const saved = (await api.v1.storyStorage.get(GUIDANCE_KEY)) as string;
      if (saved) setGuidance(saved);
    })();
  }, []);

  const onGuidance = (v: string) => {
    setGuidance(v);
    void api.v1.storyStorage.set(GUIDANCE_KEY, v);
  };

  const onForge = () => {
    const text = guidance;
    const activeId = selectActiveForgeChatId(store.getState());
    if (activeId) {
      store.dispatch(chatSwitched({ id: activeId }));
      if (text.trim()) {
        const chat = store.getState().chat.chats.find((c) => c.id === activeId);
        if (chat)
          getChatTypeSpec("forge").handleSend?.(chat, text, {
            getState: store.getState,
            dispatch: store.dispatch,
          });
      }
    } else {
      store.dispatch(
        forgeChatNewSessionRequested({ initialUserMessage: text }),
      );
    }
    if (text.trim()) {
      setGuidance("");
      void api.v1.storyStorage.remove(GUIDANCE_KEY);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <span style={{ fontWeight: "bold", color: T.textHeadings }}>Forge</span>
      <textarea
        placeholder="What should the Forge build? Leave blank to open a session and Forge Ahead."
        value={guidance}
        onInput={(e) => onGuidance(e.target.value ?? "")}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          minHeight: "5em",
          fontSize: "0.85em",
          resize: "vertical",
        }}
      />
      <button
        onClick={onForge}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: SP.sm,
          padding: "6px",
          background: T.bg2,
          border: "none",
          cursor: "pointer",
          color: T.textHeadings,
        }}
      >
        <Zap size={16} />
        Forge
      </button>
    </div>
  );
}
