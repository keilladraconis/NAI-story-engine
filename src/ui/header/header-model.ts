// Pure derivation for the header.
//
// `derive` is the ONLY place in the codebase that branches on genx.status —
// every other surface keys off per-target request ids. tests/ui/countdown.test.ts
// enforces that mechanically.
//
// `storeSignature` is the change-detection key Header.tsx subscribes with. It
// must cover every store field `derive` reads: a missing field means the header
// silently goes stale until the next timer tick rather than failing loudly.

import type { RootState } from "../../core/store";
import { remainingSeconds, waitLabel } from "./countdown";

export type WidgetMode = "budget" | "cancel" | "continue" | "wait";

export type HeaderModel = {
  widget: { mode: WidgetMode; text: string };
  /** Empty string collapses the status row to display:none. */
  statusText: string;
  bootstrap: { text: string; disabled: boolean };
  importDisabled: boolean;
};

export type DeriveInputs = {
  /** api.v1.script.getAllowedOutput() */
  allowedOutput: number;
  /** Cached async read of api.v1.document.sectionIds(); the driver owns it. */
  hasDocumentContent: boolean;
  /** Date.now(), injected so derive stays pure. */
  now: number;
};

const BOOTSTRAP_TYPES: readonly string[] = ["bootstrap", "bootstrapContinue"];

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

/** Is an opening/continue generation queued or in flight? Exported because the
 *  header also re-reads the document when one settles — a bootstrap is what
 *  turns an empty story into a non-empty one. */
export function selectBootstrapPending(state: RootState): boolean {
  const { queue, activeRequest } = state.runtime;
  return (
    queue.some((r) => BOOTSTRAP_TYPES.includes(r.type)) ||
    (activeRequest !== null && BOOTSTRAP_TYPES.includes(activeRequest.type))
  );
}

export function derive(state: RootState, inputs: DeriveInputs): HeaderModel {
  const { sega } = state.runtime;

  return {
    widget: deriveWidget(state, inputs),
    statusText: sega.statusText,
    bootstrap: {
      text: inputs.hasDocumentContent ? "Continue Scene" : "Opening Scene",
      disabled: selectBootstrapPending(state),
    },
    importDisabled: state.ui.importWizardOpen,
  };
}

export function storeSignature(state: RootState): string {
  const { genx, sega, queue, activeRequest, historyEpoch } = state.runtime;
  return [
    genx.status,
    genx.budgetWaitEndTime ?? "",
    sega.statusText,
    // Full composition, not length: a same-size queue with different contents
    // changes what the header shows.
    queue.map((r) => `${r.type}:${r.id}`).join(","),
    activeRequest?.id ?? "",
    state.ui.importWizardOpen ? "1" : "0",
    historyEpoch,
  ].join("|");
}
