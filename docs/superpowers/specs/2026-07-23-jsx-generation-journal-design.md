# JSX Generation Journal

**Date:** 2026-07-23
**Status:** Approved (design)
**Branch:** v14

## Context

The **Generation Journal** is the last SUI-only panel: `SeJournalPanel`, mounted
as its own `scriptPanel` (gated by the `generation_journal` config flag, default
`false`). It shows a recorded-entry count and copy buttons that write formatted
journal/digest text to the clipboard, plus a Clear. This slice **replaces** it
with a JSX implementation and retires the SUI component — not a side-by-side.

**No backend changes** — it reuses the existing `src/core/generation-journal`
module: `loadJournal()`, `getJournalCount()`, `formatJournal()`, `formatDigest()`,
`formatBootstrapDigest()`, `formatForgeDigest()`, `clearJournal()`.

## Goal

A JSX `JournalPanel` mounted as the "Generation Journal" panel (same config gate),
with the entry count and the Full / SEGA / Bootstrap / Forge copy buttons and
Clear — replacing `SeJournalPanel` in `plugin.ts`.

## Non-Goals

- Any change to the journal module, recording, or formats.
- Keeping the SUI `SeJournalPanel` (it is removed from the registration).
- Changing the `generation_journal` gate or its default (`false`).

## Reference behavior (SUI `SeJournalPanel`, verified)

- Count text: `` `${getJournalCount()} entries recorded` ``, updated by a watch on
  `s.runtime.activeRequest` (a proxy for "generation progressed").
- Buttons (each `api.v1.clipboard.writeText(fmt())` + a success toast):
  - **Full** → `formatJournal()`; **SEGA** → `formatDigest()`; **Bootstrap** →
    `formatBootstrapDigest()`; **Forge** → `formatForgeDigest()`.
  - **Clear** → `clearJournal()` then reset the count display to "0 entries
    recorded".
- Registration (`plugin.ts`):
  ```ts
  const journalEnabled = await api.v1.config.get("generation_journal");
  if (journalEnabled) {
    api.v1.permissions.request(["clipboardWrite"]);
    loadJournal();
    const journalPart = await new SeJournalPanel({ id: "kse-journal-root" }).build();
    panels.push(scriptPanel({ id: "kse-journal", name: "Generation Journal", content: [journalPart] }));
  }
  ```
- JSX panels mount via a `jsx` part rendered into a shadow host and wrapped in a
  panel (see `mount.ts`'s `buildJsxSidebarPanel`); `render(h(Component, null), elem)`
  in the part's `onMount`.

## Components

### `src/ui-jsx/panels/journal/JournalPanel.tsx` (new)

```tsx
export function JournalPanel() {
  // Re-render on request boundaries (proxy for "journal advanced"), like the SUI
  // watch. Primitive selector — no render loop.
  useSlice((s) => s.runtime.activeRequest?.id ?? "");
  const [, force] = useState(0); // bump after Clear so the count re-reads to 0

  const count = getJournalCount();
  const copy = async (fmt: () => string, label: string) => {
    await api.v1.clipboard.writeText(fmt());
    void api.v1.ui.toast(`${label} copied to clipboard`, { type: "success" });
  };

  return (
    <div style={/* row: count (flex:1) + Full/SEGA/Bootstrap/Forge/Clear buttons, wrap */}>
      <span>{count} entries recorded</span>
      <button onClick={() => copy(formatJournal, "Journal")}>Full</button>
      <button onClick={() => copy(formatDigest, "SEGA digest")}>SEGA</button>
      <button onClick={() => copy(formatBootstrapDigest, "Bootstrap digest")}>Bootstrap</button>
      <button onClick={() => copy(formatForgeDigest, "Forge digest")}>Forge</button>
      <button onClick={() => { clearJournal(); force((n) => n + 1); }}>Clear</button>
    </div>
  );
}
```
- Imports the six journal-module functions from `../../../core/generation-journal`;
  `useSlice` from `../../bridge`; `T`/`SP` from `../../style`.
- Styling: a small padded flex row with wrap; count `flex: 1`; buttons compact.
  (`useState`/`useEffect`/`h` are NAI globals — not imported.)

### `buildJsxJournalPanel()` — add to `src/ui-jsx/mount.ts`

Mirror `buildJsxSidebarPanel`, but render `<JournalPanel/>` into a **`scriptPanel`**
named "Generation Journal" (a short, non-scrolling panel — a simple `jsx` part,
no grid-height constraint needed):
```ts
export function buildJsxJournalPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-journal-root",
    onMount: (elem) => {
      render(h(JournalPanel, null), elem);
    },
  });
  return scriptPanel({
    id: "kse-journal",
    name: "Generation Journal",
    content: [jsxPart],
  });
}
```
(`scriptPanel` from `api.v1.ui.extension`; import `JournalPanel`.)

### `plugin.ts` swap

Replace the `SeJournalPanel` block with the JSX builder, keeping the gate,
`loadJournal()`, and the clipboard permission:
```ts
const journalEnabled = await api.v1.config.get("generation_journal");
if (journalEnabled) {
  api.v1.permissions.request(["clipboardWrite"]);
  loadJournal();
  panels.push(buildJsxJournalPanel());
}
```
- Remove `import { SeJournalPanel } from "./components/SeJournalPanel";`.
- Add `buildJsxJournalPanel` to the existing `../ui-jsx/mount` import.
- `loadJournal()` stays in `plugin.ts` (runs before `register()` mounts the part,
  so the first render's count is correct).

## Tasks

1. `JournalPanel.tsx` — the component (count + copy buttons + clear).
2. `buildJsxJournalPanel()` in `mount.ts` + `plugin.ts` swap (remove SUI journal).

## Testing

- tsc-gated + live-verify (no unit tests — a small reactive panel; the format
  functions are already covered by the module's own tests, if any).
- Live-verify: enable the **Generation Journal** script setting
  (`generation_journal`, default off) and reload. A separate **"Generation
  Journal"** panel appears with an entry count + Full/SEGA/Bootstrap/Forge/Clear.
  Run a generation → the count increases (on request boundaries). Click **Full** →
  a "Journal copied to clipboard" toast (paste to confirm). Click **Clear** → count
  resets to 0.

## Risks / Notes

- **`useSlice` primitive**: the selector returns `activeRequest?.id ?? ""` (a
  string) — no fresh-object render loop.
- **Count freshness**: like SUI, the count updates on request boundaries, not on
  every individual `recordEntry`. Acceptable.
- **Gate default off**: the panel only appears when the user enables
  `generation_journal`; live-verify requires toggling it on.
- **`loadJournal()` timing**: called in `plugin.ts` before `register()`, so the
  panel's first render reads the loaded count.
- The `jsx` journal part needs no height/grid constraint (unlike the main App
  part) — its content is a single short row.
