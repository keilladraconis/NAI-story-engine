// GenX status surface for the JSX header — the single home for live generation
// feedback (any active gen): a Continue button on presence-wait, a budget-wait
// countdown, else the SEGA status text (truncated, no marquee). Mirrors the
// genx.status branching in SendButton.tsx.

import { useSlice } from "../../bridge";
import { T } from "../../style";
import {
  store,
  uiUserPresenceConfirmed,
  uiRequestCancellation,
} from "../../../core/store";
import { useCountdown } from "./countdown";

export function GenxStatus() {
  const status = useSlice((s) => s.runtime.genx.status);
  const budgetEnd = useSlice((s) => s.runtime.genx.budgetWaitEndTime ?? null);
  const statusText = useSlice((s) => s.runtime.sega.statusText);
  const secs = useCountdown(status === "waiting_for_budget" ? budgetEnd : null);

  if (status === "waiting_for_user") {
    return (
      <button
        style={{
          padding: "4px 8px",
          fontSize: "0.8em",
          borderRadius: "4px",
          border: "none",
          cursor: "pointer",
          background: T.textHeadings,
          color: T.bg,
          fontWeight: "bold",
        }}
        onClick={() => store.dispatch(uiUserPresenceConfirmed())}
      >
        ⚠️ Continue
      </button>
    );
  }

  if (status === "waiting_for_budget") {
    return (
      <button
        title="Cancel"
        style={{
          padding: "4px 8px",
          fontSize: "0.8em",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: T.text,
          opacity: 0.8,
        }}
        onClick={() => store.dispatch(uiRequestCancellation())}
      >
        ⏳ Wait ({secs}s)
      </button>
    );
  }

  // Idle/generating: truncated SEGA status text (empty renders nothing visible).
  return (
    <span
      style={{
        fontSize: "0.8em",
        opacity: 0.8,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {statusText}
    </span>
  );
}
