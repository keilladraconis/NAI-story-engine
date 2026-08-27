// Whether the story has any prose yet. It decides the opening-scene card —
// `showBootstrap` in setup-model.ts shows it only while the document is blank —
// and seeds the opening tab in tabs.ts.
//
// **This is a question about document content, not about history.** It used to
// be answered by `runtime.historyEpoch`, bumped by the one `onHistoryNavigated`
// registration, and that registration went with §7's reconciliation: Story
// Engine's records move forward only and it does not watch history any more.
// The card still has to notice, though, and for a reason that has nothing to do
// with the World reverting — a writer who generates an opening scene, dislikes
// it and undoes back to a blank document needs the card back to generate
// another one.
//
// So it polls, and the poll is strictly wider than the epoch it replaces. The
// note here used to call a history move and a settling bootstrap "the two ways
// an empty story becomes non-empty", which was never true: typing the opening
// scene by hand is a third, and `onHistoryNavigated` fires for explicit
// navigation only, never for ordinary editing. Those cases were simply
// unanswered. A read of the document answers all of them and asks nothing about
// how it got that way.
//
// `initial` is read once in mount.ts before register(), so the first paint is
// already right and the poll only ever corrects it.

import { useSlice } from "../../bridge";
import { selectBootstrapPending } from "./setup-model";

/** Slow on purpose. The value moves rarely and gates a card rather than
 *  anything mid-gesture, so this is a background correction, not a live
 *  reading. Matches the header's idle heartbeat. */
const POLL_MS = 5000;

/**
 * Reads the document until stopped, reporting whether it holds any prose:
 * once immediately, then `delayMs` after each read lands. Returns the stopper.
 *
 * Serial rather than an interval — `api.v1.timers` has no setInterval, and
 * arming the next read only once the previous has resolved means a slow read
 * cannot stack a second one behind it.
 *
 * Split out of the hook so the polling itself is testable: the hooks are NAI
 * runtime globals with no renderer under vitest, and this needs only `api.v1`.
 */
export function watchDocumentContent(
  onChange: (hasContent: boolean) => void,
  delayMs: number = POLL_MS,
): () => void {
  let stopped = false;
  let pending: number | null = null;

  const arm = (): void => {
    void api.v1.timers
      .setTimeout(() => {
        pending = null;
        void read();
      }, delayMs)
      .then((id: number) => {
        // The creation promise can resolve after the stopper ran; clear it if so.
        if (stopped) void api.v1.timers.clearTimeout(id);
        else pending = id;
      });
  };

  const read = async (): Promise<void> => {
    const ids = await api.v1.document.sectionIds();
    if (stopped) return;
    onChange(ids.length > 0);
    arm();
  };

  void read();

  return () => {
    stopped = true;
    if (pending !== null) void api.v1.timers.clearTimeout(pending);
  };
}

export function useHasDocumentContent(initial: boolean): boolean {
  const [has, setHas] = useState(initial);

  // Not the only trigger any more, but still the immediate one: a bootstrap
  // settling is the transition the writer is actually waiting on, and
  // restarting the watch reads at once rather than waiting out a poll.
  const bootstrapPending = useSlice(selectBootstrapPending);

  // `setHas` is reported unconditionally and useState bails out on an unchanged
  // value, so a story whose answer never moves costs one read per poll and no
  // renders at all.
  useEffect(() => watchDocumentContent(setHas), [bootstrapPending]);

  return has;
}
