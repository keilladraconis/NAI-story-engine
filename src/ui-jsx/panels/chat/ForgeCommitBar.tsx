// Two-button [Commit]/[Discard] bar for a forge chat, mirroring RefineCommitBar.
// Both END the session (the effect deletes the chat); onEnd returns to the Story
// Engine. Commit casts every draft to live (enabled only with ≥1 draft); Discard
// tombstones + deletes every draft. The active chat is resolved at click time.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, activeSavedChat } from "../../../core/store";
import {
  forgeCastAllRequested,
  forgeDiscardAllRequested,
} from "../../../core/store/effects/forge-chat-effects";
import { selectForgeDraftPoolCount } from "../../../core/store/selectors/forge";

export function ForgeCommitBar(props: { onEnd: () => void }) {
  const canCommit = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return !!c && selectForgeDraftPoolCount(s, c.id) >= 1;
  });

  return (
    <div style={{ display: "flex", gap: SP.sm, padding: SP.md, borderTop: `1px solid ${T.bg2}` }}>
      <button
        disabled={!canCommit}
        style={{ flex: 1, padding: "6px", color: T.midIntensity, opacity: canCommit ? 1 : 0.4, cursor: canCommit ? "pointer" : "default" }}
        onClick={() => {
          const chat = activeSavedChat(store.getState().chat);
          if (chat && canCommit) {
            store.dispatch(forgeCastAllRequested({ chatId: chat.id }));
            props.onEnd();
          }
        }}
      >
        Commit
      </button>
      <button
        style={{ flex: 1, padding: "6px", color: T.warning }}
        onClick={() => {
          const chat = activeSavedChat(store.getState().chat);
          if (chat) {
            store.dispatch(forgeDiscardAllRequested({ chatId: chat.id }));
            props.onEnd();
          }
        }}
      >
        Discard
      </button>
    </div>
  );
}
