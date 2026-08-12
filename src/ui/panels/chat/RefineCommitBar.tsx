// src/ui/panels/chat/RefineCommitBar.tsx
import { T, SP } from "../../style";
import { useTapGuard } from "../../tap-guard";
import {
  store,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  activeSavedChat,
} from "../../../core/store";

export function RefineCommitBar() {
  // Both end the refine session, and the target chat is re-resolved from the
  // store on each click — so an unguarded repeat from one tap would commit or
  // discard against whichever chat became active. One guard each.
  const onceCommitTap = useTapGuard();
  const onceDiscardTap = useTapGuard();

  return (
    <div
      style={{
        display: "flex",
        gap: SP.sm,
        padding: SP.md,
        borderTop: `1px solid ${T.bg2}`,
      }}
    >
      <button
        style={{ flex: 1, padding: "6px", color: T.midIntensity }}
        onClick={() =>
          onceCommitTap(() => {
            const chat = activeSavedChat(store.getState().chat);
            if (chat)
              store.dispatch(uiChatRefineCommitted({ chatId: chat.id }));
          })
        }
      >
        Commit
      </button>
      <button
        style={{ flex: 1, padding: "6px", color: T.warning }}
        onClick={() =>
          onceDiscardTap(() => {
            const chat = activeSavedChat(store.getState().chat);
            if (chat)
              store.dispatch(uiChatRefineDiscarded({ chatId: chat.id }));
          })
        }
      >
        Discard
      </button>
    </div>
  );
}
