// Pure derivation for the UIPart header.
//
// `derive` is the ONLY place in the codebase that branches on genx.status —
// every other surface keys off per-target request ids. tests/ui/countdown.test.ts
// enforces that mechanically.
//
// `storeSignature` is the change-detection key the driver subscribes with. It
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

/** "412 out" below 1k, "1.2k out" at or above it. No ⚡ — the bolt belongs to
 *  the action buttons, so the readout doesn't read as a third action. */
export function formatOutputBudget(tokens: number): string {
  const n = tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
  return `${n} out`;
}

function deriveWidget(
  state: RootState,
  inputs: DeriveInputs,
): HeaderModel["widget"] {
  const { genx } = state.runtime;
  if (genx.status === "waiting_for_user") {
    return { mode: "continue", text: "⚠️ Continue" };
  }
  if (genx.status === "waiting_for_budget") {
    const secs = remainingSeconds(genx.budgetWaitEndTime ?? null, inputs.now);
    return { mode: "wait", text: waitLabel(secs) };
  }
  if (genx.status === "queued" || genx.status === "generating") {
    return { mode: "cancel", text: "🚫 Cancel" };
  }
  return { mode: "budget", text: formatOutputBudget(inputs.allowedOutput) };
}

export function derive(state: RootState, inputs: DeriveInputs): HeaderModel {
  const { sega, queue, activeRequest } = state.runtime;

  const bootstrapPending =
    queue.some((r) => BOOTSTRAP_TYPES.includes(r.type)) ||
    (activeRequest !== null && BOOTSTRAP_TYPES.includes(activeRequest.type));

  return {
    widget: deriveWidget(state, inputs),
    statusText: sega.statusText,
    bootstrap: {
      text: inputs.hasDocumentContent
        ? "⚡ Continue Scene"
        : "⚡ Opening Scene",
      disabled: bootstrapPending,
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
