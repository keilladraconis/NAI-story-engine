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
