// Pure derivation for the header.
//
// `derive` is the ONLY place in the codebase that branches on genx.status —
// every other surface keys off per-target request ids. tests/ui/countdown.test.ts
// enforces that mechanically.
//
// `storeSignature` is the change-detection key Header.tsx subscribes with. It
// must cover every store field `derive` reads: a missing field means the header
// silently goes stale until the next timer tick rather than failing loudly.
//
// The bootstrap and import derivation used to live here too; it moved to
// `src/ui/panels/setup/setup-model.ts` when those controls left the header for
// the Setup tab. What remains is the generation state machine and nothing else.

import type { RootState } from "../../core/store";
import { remainingSeconds, waitLabel } from "./countdown";

export type WidgetMode = "budget" | "cancel" | "continue" | "wait";

export type HeaderModel = {
  widget: { mode: WidgetMode; text: string };
  /** Empty string collapses the status row to display:none. */
  statusText: string;
};

export type DeriveInputs = {
  /** api.v1.script.getAllowedOutput() */
  allowedOutput: number;
  /** Date.now(), injected so derive stays pure. */
  now: number;
};

/** Spelled out in full — "GenX: 2000 tokens". An abbreviated readout ("2.0k
 *  out") reads as cryptic jargon in a header that is otherwise plain English,
 *  and the exact count is the number a user actually reasons about when a
 *  generation is about to stall. No glyph: the button carries a `zap` iconId. */
export function formatOutputBudget(tokens: number): string {
  return `GenX: ${tokens} ${tokens === 1 ? "token" : "tokens"}`;
}

function deriveWidget(
  state: RootState,
  inputs: DeriveInputs,
): HeaderModel["widget"] {
  const { genx } = state.runtime;
  // Labels carry no emoji — every widget mode has its own feather iconId (see
  // WIDGET_ICONS in Header.tsx), so a glyph here would render twice.
  if (genx.status === "waiting_for_user") {
    return { mode: "continue", text: "Continue" };
  }
  if (genx.status === "waiting_for_budget") {
    const secs = remainingSeconds(genx.budgetWaitEndTime ?? null, inputs.now);
    return { mode: "wait", text: waitLabel(secs) };
  }
  if (genx.status === "queued" || genx.status === "generating") {
    return { mode: "cancel", text: "Cancel" };
  }
  return { mode: "budget", text: formatOutputBudget(inputs.allowedOutput) };
}

export function derive(state: RootState, inputs: DeriveInputs): HeaderModel {
  const { sega } = state.runtime;

  return {
    widget: deriveWidget(state, inputs),
    statusText: sega.statusText,
  };
}

/** Exactly the fields `derive` reads, and nothing more — the queue, the active
 *  request and the wizard flag are setup-model's business now, and keeping them
 *  here would repaint the header on churn it no longer displays. */
export function storeSignature(state: RootState): string {
  const { genx, sega } = state.runtime;
  return [genx.status, genx.budgetWaitEndTime ?? "", sega.statusText].join("|");
}
