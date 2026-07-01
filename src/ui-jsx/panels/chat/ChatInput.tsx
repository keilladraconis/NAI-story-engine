// src/ui-jsx/panels/chat/ChatInput.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  uiChatSubmitUserMessage,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import { CHAT_INPUT_KEY } from "./chat-actions";

export function ChatInput() {
  const chatId = useSlice((s) => s.chat.activeChatId);
  const chatType = useSlice((s) => activeSavedChat(s.chat)?.type ?? "");
  const draftRef = useRef("");
  const [nonce, setNonce] = useState(0);

  if (!chatId || !chatType) return null;
  const spec = getChatTypeSpec(chatType);
  const ctx = { getState: store.getState, dispatch: store.dispatch };

  const doSend = () => {
    const text = draftRef.current;
    void (async () => {
      // Hand the composer text to the effect via its storyStorage slot, then
      // dispatch. Await the set so the effect's get() sees the latest value.
      await api.v1.storyStorage.set(CHAT_INPUT_KEY, text);
      store.dispatch(uiChatSubmitUserMessage({ chatId }));
    })();
    draftRef.current = "";
    setNonce((n) => n + 1); // remount textarea → clears the uncontrolled value
  };

  const doClear = () => {
    if (spec.onClear) {
      const chat = activeSavedChat(store.getState().chat);
      if (chat) spec.onClear(chat, ctx);
      return;
    }
    draftRef.current = "";
    setNonce((n) => n + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm, padding: SP.md }}>
      <textarea
        key={nonce}
        rows={3}
        placeholder={spec.inputPlaceholder ?? "Message…"}
        onInput={(e) => {
          draftRef.current = e.target.value ?? "";
        }}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          resize: "vertical",
        }}
      >
        {""}
      </textarea>
      <div style={{ display: "flex", gap: SP.sm }}>
        <button onClick={doSend} style={{ padding: "4px 16px" }}>
          {spec.sendLabel ?? "Send"}
        </button>
        {spec.showClearButton && <button onClick={doClear}>Clear</button>}
      </div>
    </div>
  );
}
