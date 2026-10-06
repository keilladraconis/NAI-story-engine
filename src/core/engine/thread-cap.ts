// The thread limit, as arithmetic.
//
// The limit restrains the ENGINE: at the limit the review pass admits no new
// Thread. It does not displace anything and it does not stop the writer or the
// Forge creating one. Admission by the slow review pass is the real
// proliferation control; this is the backstop behind it.
//
// Pure. `applyFloors` (review-strategy.ts) and the drain's admit arm are the
// two callers.

import type { Thread } from "../store/types";

/** The limit as everything downstream must read it: at least 1, and whole. */
export function effectiveCap(cap: number): number {
  return Math.max(1, Math.floor(cap) || 1);
}

/** Open Threads only. A concluded Thread's entry is disabled and costs no
 *  context, so it holds no slot. */
export function openThreadCount(
  threads: readonly Pick<Thread, "status">[],
): number {
  return threads.filter((t) => t.status === "open").length;
}

/** Whether the Engine may admit no more Threads: open ones have reached the
 *  limit. The one comparison both callers share, so they cannot disagree. */
export function atThreadCap(
  threads: readonly Pick<Thread, "status">[],
  cap: number,
): boolean {
  return openThreadCount(threads) >= effectiveCap(cap);
}
