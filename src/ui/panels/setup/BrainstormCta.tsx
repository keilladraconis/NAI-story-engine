// "Talk it through" — the obvious next step once a register is chosen and the
// Foundation is still blank. Sits directly under the Intensity picker and only
// while every field card is empty (Setup owns that condition), so it is a
// starting prompt rather than permanent furniture.
//
// Sized to match the field cards it stands in for: full width, card background,
// its own padding. A small text link would read as an afterthought in the one
// place where it is the primary action.
//
// Two states, because the brainstorm reads Intensity for its register: until one
// is picked the box points back up at the picker instead of offering a chat that
// would start without a tone.

import { store, chatCreated, chatSwitched } from "../../../core/store";
import { useSlice } from "../../bridge";
import { SP, T } from "../../style";
import { nextBrainstormTitle } from "../chat/chat-actions";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { ArrowUp, MessageSquare } from "nai:icons/feather";

/** Both glyphs stay mounted and toggle via `display`. Swapping one component
 *  type for another at a fixed position leaves the old svg behind when the
 *  re-render arrives from a store subscription rather than a JSX event handler —
 *  which is exactly how this one arrives, since picking an Intensity dispatches.
 *  Same workaround as ConfirmButton and the header's WidgetIcon. */
function CtaIcon(props: { ready: boolean }) {
  return (
    <Fragment>
      <MessageSquare
        size={16}
        style={{ display: props.ready ? "inline-flex" : "none" }}
      />
      <ArrowUp
        size={16}
        style={{ display: props.ready ? "none" : "inline-flex" }}
      />
    </Fragment>
  );
}

export function BrainstormCta(props: { onOpenChat: () => void }) {
  // The level string, not the object: useSlice compares snapshots with Object.is
  // and a fresh object each read would loop.
  const level = useSlice((s) => s.foundation.intensity?.level ?? "");
  const ready = level !== "";

  // Not `disabled` — the UA greys a disabled button on its own, and this box is
  // at its most useful in exactly the state that would grey it. The check lives
  // in the handler instead, which is where CLAUDE.md puts it anyway: `disabled`
  // is a render-time value, never the guard.
  //
  // No re-entry guard beyond that, matching Sessions.tsx's New chat: the body is
  // wholly synchronous, so there is no await for a second press to slip inside,
  // and the first click switches to the Chat tab — which unmounts this button.
  const start = () => {
    if (!ready) return;
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
        border: `1px solid ${ready ? T.textHeadings : T.bg3}`,
        cursor: ready ? "pointer" : "default",
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        opacity: 1,
      }}
    >
      {/* Nothing here is dimmed while waiting. The waiting state is the one that
          has to catch the eye — anything that reads as disabled becomes one more
          inert control and the prompt goes unread. Only the border stays muted,
          to say "not yet" without hiding the message. */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: SP.sm,
          color: T.textHeadings,
          fontWeight: "bold",
        }}
      >
        <CtaIcon ready={ready} />
        {ready ? "Talk it through" : "Choose an Intensity first"}
      </span>
      <span style={{ fontSize: "0.85em", opacity: ready ? 0.8 : 1 }}>
        {ready
          ? "Not sure where to start? Brainstorm the story and fill the Foundation from the conversation."
          : "Pick a register above. The brainstorm writes in the tone you set, so it is worth choosing before you start talking."}
      </span>
    </button>
  );
}
