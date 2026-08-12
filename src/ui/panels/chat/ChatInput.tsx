// src/ui/panels/chat/ChatInput.tsx
// The footer owns the composer. The textarea is a plain controlled input:
// `value` + `onInput` keep its text in local state, and clearing is just
// `setText("")`. `onInput` (per keystroke), never `onChange` (fires on blur
// only — the renderer keeps native DOM semantics), so Send never reads a
// pre-edit value. No Ctrl/Cmd+Enter submit yet — the JSX renderer has no <form>
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
import { SendButton } from "./SendButton";
import { useTapGuard } from "../../tap-guard";
import {
  readComposerDraft,
  writeComposerDraft,
  clearComposerDraft,
} from "./composer-draft";

export function ChatInput() {
  const chatId = useSlice((s) => s.chat.activeChatId);
  const chatType = useSlice((s) => activeSavedChat(s.chat)?.type ?? "");
  // Seeded from the draft buffer, so text typed before a tab switch is already
  // there on the first render after remounting.
  const [text, setText] = useState(readComposerDraft(chatId ?? ""));
  const [confirming, setConfirming] = useState(false);

  // Mirror every keystroke into the buffer so it outlives this component.
  const editText = (next: string) => {
    setText(next);
    writeComposerDraft(chatId ?? "", next);
  };

  // The active chat can change while the composer stays mounted (a refine or
  // forge session opening switches it underneath us). Swap in that chat's own
  // draft rather than leaving the previous chat's text in the box.
  useEffect(() => {
    setText(readComposerDraft(chatId ?? ""));
  }, [chatId]);
  // One tap = one send. A repeated mobile click submits a second, empty body
  // immediately after `setText("")` — and an empty send on an assistant tail
  // means "continue", so it would fire a stray generation.
  const onceTap = useTapGuard();

  const submit = () => {
    const cid = store.getState().chat.activeChatId;
    if (!cid) return;
    store.dispatch(uiChatSubmitUserMessage({ chatId: cid, text }));
    clearComposerDraft(cid);
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
    clearComposerDraft(chat?.id ?? chatId ?? "");
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
        onInput={(e) => editText(e.target.value ?? "")}
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
        <SendButton
          label={spec.sendLabel || "Send"}
          onGenerate={() => onceTap(submit)}
        />
        {showClear && (
          <button
            // Guarded: the duplicate tap would arm the confirm AND fire it,
            // wiping the chat from a single tap.
            onClick={() => onceTap(clear)}
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
