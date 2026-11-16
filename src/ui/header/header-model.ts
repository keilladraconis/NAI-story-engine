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
 * How far a job has got: the tokens received so far, thinking included, of
 * the tokens requested. Never 100 before it lands: a reply can stop short of
 * its cap, so the figure jumps to done when it does.
 */
export function percent(received: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.min(99, Math.floor((received / maxTokens) * 100));
}

/** `received`: tokens of the oldest job's reply received so far. */
export function derive(
  state: RootState,
  now: number,
  received = 0,
): HeaderModel {
  const { jobs, genx } = state.runtime;
  const widget = deriveWidget(state, now);
  if (!jobs.length) return { widget, statusText: "", busy: false };
  const more = jobs.length > 1 ? ` · ${jobs.length - 1} more` : "";
  const progress =
    genx.status === "generating"
      ? ` ${percent(received, jobs[0].maxTokens)}%`
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
    jobs.map((j) => `${j.id}:${j.label}`).join(","),
  ].join("|");
}
