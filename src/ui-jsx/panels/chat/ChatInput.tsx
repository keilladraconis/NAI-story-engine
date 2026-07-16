// src/ui-jsx/panels/chat/ChatInput.tsx
// The footer owns the composer. The textarea is a plain controlled input:
// `value` + `onChange` keep its text in local state, and clearing is just
// `setText("")`. No Ctrl/Cmd+Enter submit yet — the JSX renderer has no <form>
// and never fires `onSubmit` on a bare <textarea>, and capturing `keydown` to
// pre-empt the editor's story-gen hotkey also cancels character input. Parked
// pending an upstream fix; Send button is the submit path for now.
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  uiChatSubmitUserMessage,
  messageRemoved,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import { CHAT_INPUT_KEY } from "./chat-actions";
import { SendButton } from "./SendButton";

export function ChatInput() {
  const chatId = useSlice((s) => s.chat.activeChatId);
  const chatType = useSlice((s) => activeSavedChat(s.chat)?.type ?? "");
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);

  const submit = () => {
    const cid = store.getState().chat.activeChatId;
    if (!cid) return;
    const body = text;
    void (async () => {
      await api.v1.storyStorage.set(CHAT_INPUT_KEY, body);
      store.dispatch(uiChatSubmitUserMessage({ chatId: cid }));
    })();
    setText("");
    setConfirming(false);
  };

  if (!chatId || !chatType) return null;
  const spec = getChatTypeSpec(chatType);
  const showClear = spec.showClearButton ?? true;

  const clear = () => {
    if (!confirming) {
      setConfirming(true);
      void api.v1.timers.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    const chat = activeSavedChat(store.getState().chat);
    if (chat) {
      const ctx = { getState: store.getState, dispatch: store.dispatch };
      if (spec.onClear) {
        spec.onClear(chat, ctx);
      } else {
        for (const m of chat.messages) {
          store.dispatch(messageRemoved({ chatId: chat.id, id: m.id }));
        }
      }
    }
    setText("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        padding: SP.md,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value ?? "")}
        placeholder={spec.inputPlaceholder ?? "Message…"}
        style={{
          minHeight: "60px",
          maxHeight: "120px",
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: SP.sm }}>
        <SendButton label={spec.sendLabel || "Send"} onGenerate={submit} />
        {showClear && (
          <button
            onClick={clear}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              // Warning palette while awaiting the confirm click; subtle otherwise.
              background: confirming ? T.warning : "transparent",
              color: confirming ? T.bg : T.text,
              border: `1px solid ${confirming ? T.warning : T.bg3}`,
            }}
          >
            {confirming ? "Clear?" : "Clear"}
          </button>
        )}
      </div>
    </div>
  );
}
