// Budget-wait countdown helpers. Pure and unit-tested; consumed by
// header-model.ts's derive(), which Header.tsx re-runs on a 1s tick while a
// budget wait is active.

/** Shared label for the budget-wait button, e.g. "Wait (12s)". No glyph — the
 *  button carries a `clock` iconId, so an emoji would double up. */
export function waitLabel(seconds: number): string {
  return `Wait (${seconds}s)`;
}

/** Whole seconds remaining until `endTime` (epoch ms), floored at 0. */
export function remainingSeconds(endTime: number | null, now: number): number {
  if (endTime == null) return 0;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}
