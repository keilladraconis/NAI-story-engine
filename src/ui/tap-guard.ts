// One tap = one action.
//
// A mobile tap was observed delivering `click` to a button TWICE within a
// single gesture, the second arriving after the first had already mutated
// state. It did not reproduce on every tap, so treat it as intermittent rather
// than guaranteed — but the failure mode is bad enough to guard unconditionally:
// a send posts twice, and a two-stage confirm button arms AND fires from one
// tap, deleting data the user never confirmed.
//
// This is insurance, not a substitute for idempotent design. Where a handler
// can be made safe against repeats structurally (see uiChatSubmitUserMessage
// carrying its text in the payload instead of a shared slot), do that too.
//
// Timestamp-based rather than a timer latch: nothing to clean up on unmount,
// and no async gap during which the guard is not yet armed. Date.now() is
// available in the UI runtime (see countdown.ts).

// Wide enough to swallow a same-gesture repeat, short enough that a deliberate
// second tap — which needs the user to see the result and re-aim — still lands.
export const TAP_WINDOW_MS = 400;

/** Pure predicate (headless-testable): is this tap a repeat of the last one?
 *  `lastTs` of 0 means "no tap yet", which is never a duplicate. */
export function isDuplicateTap(
  lastTs: number,
  now: number,
  windowMs: number = TAP_WINDOW_MS,
): boolean {
  return lastTs !== 0 && now - lastTs < windowMs;
}

/** Wraps an action so repeat calls inside the tap window are ignored. */
export function useTapGuard(
  windowMs: number = TAP_WINDOW_MS,
): (action: () => void) => void {
  const lastRef = useRef(0);
  return (action: () => void) => {
    const now = Date.now();
    if (isDuplicateTap(lastRef.current, now, windowMs)) return;
    lastRef.current = now;
    action();
  };
}
