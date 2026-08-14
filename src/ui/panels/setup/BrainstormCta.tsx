// "Talk it through" — the obvious next step once a register is chosen and the
// Foundation is still blank. Sits directly under the Intensity picker and only
// while every field card is empty (Setup owns that condition), so it is a
// starting prompt rather than permanent furniture.
//
// Sized to match the field cards it stands in for: full width, card background,
// its own padding. A small text link would read as an afterthought in the one
// place where it is the primary action.

import { store, chatCreated, chatSwitched } from "../../../core/store";
import { SP, T } from "../../style";
import { nextBrainstormTitle } from "../chat/chat-actions";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { MessageSquare } from "nai:icons/feather";

export function BrainstormCta(props: { onOpenChat: () => void }) {
  // No re-entry guard, matching Sessions.tsx's New chat: the body is wholly
  // synchronous, so there is no await for a second press to slip inside, and
  // the first click switches to the Chat tab — which unmounts this button.
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
      onClick={start}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: SP.sm,
        width: "100%",
        textAlign: "left",
        background: T.bg2,
        border: `1px solid ${T.textHeadings}`,
        cursor: "pointer",
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: SP.sm,
          color: T.textHeadings,
          fontWeight: "bold",
        }}
      >
        <MessageSquare size={16} />
        Talk it through
      </span>
      <span style={{ fontSize: "0.85em", opacity: 0.8 }}>
        Not sure where to start? Brainstorm the story and fill the Foundation
        from the conversation.
      </span>
    </button>
  );
}
