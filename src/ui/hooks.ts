// Draft field state for the JSX UI edit panes. The displayed value is seeded
// synchronously from `initial` (the committed store value) on mount — matching
// SUI's edit-pane behavior — and tracked locally as the user types; Save reads
// it back via the returned value. We do NOT persist drafts to storyStorage: the
// live runtime does not reliably round-trip set->get mid-session, and the
// committed store value is the correct seed on every reopen, so a persisted
// draft would add an unreliable, unused layer.

export function useDraftField(initial: string): {
  value: string;
  setValue: (v: string) => void;
} {
  const [value, setValue] = useState(initial);
  return { value, setValue };
}
