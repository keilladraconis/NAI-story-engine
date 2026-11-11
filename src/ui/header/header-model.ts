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
  /** What the oldest job is doing, with how far it has got; empty when idle. */
  statusText: string;
  /** Work is under way: the status line shimmers. */
  busy: boolean;
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

/**
 * How far a job has got: time since it reached the model against how long the
 * last such job took, eased so it slows past 90% rather than stalling, and
 * pushed on by characters streamed against the reply's expected length. Never
 * 100 before it lands.
 */
export function percent(
  elapsed: number,
  expectMs: number,
  streamed = 0,
  expectChars = 0,
): number {
  const t = expectMs > 0 ? Math.max(0, elapsed) / expectMs : 0;
  const byTime = t < 1 ? 90 * t : 90 + 9 * (1 - Math.exp(-(t - 1)));
  const byChars = expectChars > 0 ? (streamed / expectChars) * 100 : 0;
  return Math.min(99, Math.floor(Math.max(byTime, byChars)));
}

/** `streamed`: characters of the oldest job's reply received so far. */
export function derive(
  state: RootState,
  now: number,
  streamed = 0,
): HeaderModel {
  const { jobs, genx } = state.runtime;
  const widget = deriveWidget(state, now);
  if (!jobs.length) return { widget, statusText: "", busy: false };
  const more = jobs.length > 1 ? ` · ${jobs.length - 1} more` : "";
  const job = jobs[0];
  const progress =
    genx.status === "generating" && job.startedAt
      ? ` ${percent(now - job.startedAt, job.expectMs, streamed, job.expectChars)}%`
      : "";
  return {
    widget,
    statusText: `${jobs[0].label}${progress}…${more}`,
    busy: widget.mode === "cancel",
  };
}

export function storeSignature(state: RootState): string {
  const { genx, jobs } = state.runtime;
  return [
    genx.status,
    genx.budgetWaitEndTime ?? "",
    jobs.map((j) => `${j.id}:${j.label}:${j.startedAt}`).join(","),
  ].join("|");
}
