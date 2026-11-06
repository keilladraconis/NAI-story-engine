// Pure derivation for the sidebar header.
//
// `derive` is the ONLY place in the codebase that branches on genx.status;
// tests/ui/countdown.test.ts enforces that mechanically. Two surfaces reading
// the raw status is how they drift about whether work is waiting, queued or done.
//
// `storeSignature` is the change-detection key Header.tsx subscribes with. It
// must cover every store field `derive` reads.

import type { RootState } from "../../core/store";
import { remainingSeconds, waitLabel } from "./countdown";

/** "idle" renders nothing: the header speaks only while GLM work is under way. */
export type WidgetMode = "idle" | "cancel" | "continue" | "wait";

export type HeaderModel = {
  widget: { mode: WidgetMode; text: string };
  /** What the oldest job is doing; empty when nothing is. */
  statusText: string;
};

function deriveWidget(state: RootState, now: number): HeaderModel["widget"] {
  const { genx } = state.runtime;
  if (genx.status === "waiting_for_user") {
    return { mode: "continue", text: "Continue" };
  }
  if (genx.status === "waiting_for_budget") {
    const secs = remainingSeconds(genx.budgetWaitEndTime ?? null, now);
    return { mode: "wait", text: waitLabel(secs) };
  }
  if (genx.status === "queued" || genx.status === "generating") {
    return { mode: "cancel", text: "Cancel" };
  }
  return { mode: "idle", text: "" };
}

export function derive(state: RootState, now: number): HeaderModel {
  const jobs = state.runtime.jobs;
  const more = jobs.length > 1 ? ` (+${jobs.length - 1})` : "";
  return {
    widget: deriveWidget(state, now),
    statusText: jobs.length ? `${jobs[0].label}${more}` : "",
  };
}

export function storeSignature(state: RootState): string {
  const { genx, jobs } = state.runtime;
  return [
    genx.status,
    genx.budgetWaitEndTime ?? "",
    jobs.map((j) => `${j.id}:${j.label}`).join(","),
  ].join("|");
}
