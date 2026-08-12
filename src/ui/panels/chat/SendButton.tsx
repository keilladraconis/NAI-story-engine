// Chat composer send button. Two states: enabled "⚡ {label}", or disabled
// while a chat-family request is queued or active.
//
// The old five-mode machine (queue/cancel/continue/wait) is gone. All
// generation-state interaction lives in the header widget, which is the single
// home for that state (see tests/ui/countdown.test.ts) — a second copy here
// would only be one more surface to drift.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import type { RootState } from "../../../core/store";
import { Zap } from "nai:icons/feather";

// Chat-family request types (mirrors SeBrainstormInput.isChatBusyType).
function isChatBusyType(t: string | undefined): boolean {
  return (
    t === "chat" ||
    t === "chatRefine" ||
    t === "forgeChat" ||
    t === "forgeCleanup"
  );
}

function isBusy(s: RootState): boolean {
  if (isChatBusyType(s.runtime.activeRequest?.type)) return true;
  return s.runtime.queue.some((r) => isChatBusyType(r.type));
}

export function SendButton(props: { label: string; onGenerate: () => void }) {
  const busy = useSlice(isBusy);

  return (
    <button
      disabled={busy}
      onClick={props.onGenerate}
      style={{
        flex: 1,
        padding: "6px 12px",
        cursor: busy ? "default" : "pointer",
        fontWeight: "bold",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SP.sm,
        // Mimics the NAI editor send button: transparent fill over our dark
        // backdrop, text-headings text + border.
        background: "transparent",
        color: T.textHeadings,
        border: `1px solid ${T.textHeadings}`,
        opacity: busy ? 0.4 : 1,
      }}
    >
      <Zap size={14} /> {props.label}
    </button>
  );
}
