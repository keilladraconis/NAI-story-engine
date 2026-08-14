// A small prompt under the Intensity picker: the register is chosen, now go
// talk about the story. Creates a fresh brainstorm and hands the tab switch
// back to App, which owns the active tab.

import { store, chatCreated, chatSwitched } from "../../../core/store";
import { useSlice } from "../../bridge";
import { useTapGuard } from "../../tap-guard";
import { SP, T } from "../../style";
import { nextBrainstormTitle } from "../chat/chat-actions";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { MessageSquare } from "nai:icons/feather";

export function BrainstormCta(props: { onOpenChat: () => void }) {
  const chatCount = useSlice((s) => s.chat.chats.length);
  const onceTap = useTapGuard();

  const start = () => {
    const chats = store.getState().chat.chats;
    const chat: ChatT = {
      id: api.v1.uuid(),
      type: "brainstorm",
      title: nextBrainstormTitle(chats),
      subMode: "cowriter",
      messages: [],
      seed: { kind: "blank" },
    };
    store.dispatch(chatCreated({ chat }));
    store.dispatch(chatSwitched({ id: chat.id }));
    props.onOpenChat();
  };

  return (
    <button
      // Creating a chat is not idempotent — a doubled tap would leave a stray
      // empty brainstorm behind.
      onClick={() => onceTap(start)}
      // chatCount is read only so this button re-renders when the chat list
      // changes; the title it mints must not go stale.
      title={`${chatCount} chat${chatCount === 1 ? "" : "s"} so far`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SP.sm,
        alignSelf: "flex-start",
        padding: `0 ${SP.md}`,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: T.textHeadings,
        fontSize: "0.8em",
        opacity: 0.85,
      }}
    >
      <MessageSquare size={13} />
      Talk it through
    </button>
  );
}
