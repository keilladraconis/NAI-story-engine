// Shared hooks for the JSX UI.
//
// `useDraftField` — draft field state for the edit panes.
// `useTick` — a heartbeat for values that live outside the store.
//
// Draft field state for the JSX UI edit panes. The displayed value is seeded
// synchronously from `initial` (the committed store value) on mount — matching
// SUI's edit-pane behavior — and tracked locally as the user types; Save reads
// it back via the returned value.
//
// The hook itself does not persist: `initial` is the committed value, so on
// every reopen that is the right thing to show, and a restored draft would
// resurrect edits the user walked away from instead of saving. Persistence is
// the caller's decision, made explicitly where it is actually wanted —
// EntityEditPane mirrors its name/summary drafts into the EDIT_PANE_* slots so
// generation reads the DRAFT layer (DRAFT > LOREBOOK > STATE), and the chat
// composer keeps unsent text in panels/chat/composer-draft.ts because switching
// tabs unmounts it mid-compose.
//
// This note used to claim storyStorage cannot be trusted to round-trip
// mid-session. It can — it is localStorage-backed on the client — so do not
// re-derive that constraint from this file.

export function useDraftField(initial: string): {
  value: string;
  setValue: (v: string) => void;
} {
  const [value, setValue] = useState(initial);
  return { value, setValue };
}

/**
 * Re-renders the caller every `delayMs`.
 *
 * For values a store subscription can never move: `getAllowedOutput()` and a
 * wall-clock countdown are not in the store, so nothing dispatches when they
 * change. The header reads both; the Engine HUD reads the first.
 *
 * Self-rescheduling rather than an interval: api.v1.timers has no setInterval,
 * and one chain per effect run means a changed delay cannot leave a second
 * chain ticking alongside the first.
 */
export function useTick(delayMs: number): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    let stopped = false;
    let pending: number | null = null;

    const arm = () => {
      void api.v1.timers
        .setTimeout(() => {
          if (stopped) return;
          pending = null;
          setTick((n) => n + 1);
          arm();
        }, delayMs)
        .then((id: number) => {
          // The creation promise can resolve after cleanup ran; clear it if so.
          if (stopped) void api.v1.timers.clearTimeout(id);
          else pending = id;
        });
    };
    arm();

    return () => {
      stopped = true;
      if (pending !== null) void api.v1.timers.clearTimeout(pending);
    };
  }, [delayMs]);
}
