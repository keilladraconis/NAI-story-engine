// src/ui-jsx/panels/chat/RefineCommitBar.tsx
import { T, SP } from "../../style";
import {
  store,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  activeSavedChat,
} from "../../../core/store";

export function RefineCommitBar() {
  return (
    <div style={{ display: "flex", gap: SP.sm, padding: SP.md, borderTop: `1px solid ${T.bg2}` }}>
      <button
        style={{ flex: 1, padding: "6px", color: T.midIntensity }}
        onClick={() => {
          const chat = activeSavedChat(store.getState().chat);
          if (chat) store.dispatch(uiChatRefineCommitted({ chatId: chat.id }));
        }}
      >
        Commit
      </button>
      <button
        style={{ flex: 1, padding: "6px", color: T.warning }}
        onClick={() => {
          const chat = activeSavedChat(store.getState().chat);
          if (chat) store.dispatch(uiChatRefineDiscarded({ chatId: chat.id }));
        }}
      >
        Discard
      </button>
    </div>
  );
}
