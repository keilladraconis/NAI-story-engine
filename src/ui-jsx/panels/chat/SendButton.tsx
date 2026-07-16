// Reactive send button for the chat composer — a JSX port of SUI's
// SeGenerationButton (button variant) for chat sends. It cycles through the
// generation states of the active/queued chat request:
//   gen → ⚡ Send (dispatch submit)
//   queue → ⏳ Queued (cancel the queued request)
//   cancel → 🚫 Cancel (cancel the active request)
//   continue → ⚠️ Continue (confirm user presence)
//   wait → ⏳ Wait (budget wait; click cancels)
// Idle vs busy is derived from the runtime slice via useSlice.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Zap } from "nai:icons/feather";

type Mode = "gen" | "queue" | "cancel" | "continue" | "wait";

// Chat-family request types (mirrors SeBrainstormInput.isChatBusyType).
function isChatBusyType(t: string | undefined): boolean {
  return (
    t === "chat" ||
    t === "chatRefine" ||
    t === "forgeChat" ||
    t === "forgeCleanup"
  );
}

// The active/queued chat request id, or undefined when the composer is idle.
function busyRequestId(s: RootState): string | undefined {
  const ar = s.runtime.activeRequest;
  if (ar && isChatBusyType(ar.type)) return ar.id;
  return s.runtime.queue.find((r) => isChatBusyType(r.type))?.id;
}

function computeMode(s: RootState): Mode {
  const id = busyRequestId(s);
  if (!id) return "gen";
  if (s.runtime.activeRequest?.id === id) {
    const st = s.runtime.genx.status;
    if (st === "waiting_for_user") return "continue";
    if (st === "waiting_for_budget") return "wait";
    return "cancel";
  }
  return "queue";
}

const btnBase = {
  flex: 1,
  padding: "6px 12px",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: SP.sm,
} as const;

export function SendButton(props: { label: string; onGenerate: () => void }) {
  const mode = useSlice(computeMode);

  const cancelActive = () => {
    store.dispatch(uiRequestCancellation());
    const id = busyRequestId(store.getState());
    if (id) store.dispatch(uiCancelRequest({ requestId: id }));
  };

  const make = (
    bg: string,
    fg: string,
    label: preact.ComponentChildren,
    onClick: () => void,
    borderColor?: string,
  ) => (
    <button
      style={{
        ...btnBase,
        background: bg,
        color: fg,
        border: borderColor ? `1px solid ${borderColor}` : "none",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  switch (mode) {
    case "queue":
      return make(T.bg2, T.text, "⏳ Queued", () => {
        const id = busyRequestId(store.getState());
        if (id) store.dispatch(uiCancelRequest({ requestId: id }));
      });
    case "cancel":
      return make(T.warning, T.bg, "🚫 Cancel", cancelActive);
    case "continue":
      return make(T.textHeadings, T.bg, "⚠️ Continue", () =>
        store.dispatch(uiUserPresenceConfirmed()),
      );
    case "wait":
      return make(T.bg2, T.text, "⏳ Wait", cancelActive);
    default:
      // Mimics the NAI editor send button: transparent fill (our backdrop is
      // already dark), text-headings text + border.
      return make(
        "transparent",
        T.textHeadings,
        <>
          <Zap size={14} /> {props.label}
        </>,
        props.onGenerate,
        T.textHeadings,
      );
  }
}
