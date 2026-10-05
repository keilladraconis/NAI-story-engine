# JSX Import Wizard

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The last SUI-only header feature is the **Import wizard** (`SeImportWizard`, ~507
lines): it imports existing story content into Story Engine — Memory→ATTG,
A/N→Style, generate Shape/Intent from the story, and bind existing (unmanaged)
lorebook entries to Story Engine entities. This slice ports it to JSX as a
full-view takeover of the Story Engine tab, opened from a new **Import** button
in the header. **No backend changes** — every action and API already exists.

This is the first JSX component to load lorebook data (`api.v1.lorebook.entries()`
/`categories()`), memory (`api.v1.memory.get()`), and A/N (`api.v1.an.get()`).

## Goals

- An Import button in the JSX header opens a wizard that takes over the Story
  Engine view (Back closes it).
- **Foundation import**: Memory→ATTG, A/N→Style (each with a preview + one-click
  import, marked done), and Story→Shape+Intent generation triggers.
- **Lorebook binding**: list *unmanaged* lorebook entries grouped by category,
  each with a DULFS category picker and a Bind action; bound entries drop out
  live. Plus **Import All** (batch everything, close) and **Refresh**.

## Non-Goals

- The **startup auto-trigger** (SUI auto-opens the wizard when no SE entities
  exist but external content is detected) — deferred. The manual button is the core.
- Any backend/state/prompt change.

## Reference behavior (SUI `SeImportWizard`, verified)

- Sources loaded on open: `api.v1.memory.get()`, `api.v1.an.get()`,
  `api.v1.lorebook.entries()`, `api.v1.lorebook.categories()`.
- **Unmanaged** = lorebook entries whose id is NOT any SE entity's
  `lorebookEntryId` (`world.entitiesById`).
- Foundation rows:
  - Memory→ATTG (only if memory non-empty): `attgUpdated({ attg: memText })` +
    `attgSyncSet({ enabled: true })` + `api.v1.memory.set(memText)`; row → dimmed
    "Imported ✓".
  - A/N→Style (only if A/N non-empty): `styleUpdated({ style: anText })` +
    `styleSyncSet({ enabled: true })`; row → "Imported ✓".
  - Story→Shape+Intent (always): `shapeGenerationRequested()` /
    `intentGenerationRequested()`.
- Lorebook body: unmanaged grouped by `entry.category` (named categories
  alphabetical by name, "uncategorized" last). Each entry: `displayName ||
  "(unnamed)"`, a DULFS cycle button (`${DULFS_SHORT[catId]} ▶`, seeded by
  `detectCategory(entry.text)`, cycled via `cycleDulfsCategory`), and a **⚡ Bind**
  button → `entityBound({ entity: { id: uuid, categoryId: catId, lorebookEntryId,
  name: displayName || "Unknown", summary: "", lifecycle: "live" } })` + a success
  toast. Empty states: "No lorebook entries found." vs "All lorebook entries are
  already bound…".
- Header: Back (close), title, Refresh (reload lorebook + toast), **Import All**:
  ATTG + Style (if present) + `entitiesBoundBatch` of all unmanaged + Shape +
  Intent, then close.
- Helpers (`core/utils/category-detect`): `detectCategory(text): DulfsFieldID`,
  `cycleDulfsCategory(current): DulfsFieldID`, `DULFS_CATEGORY_LABELS`.
- `LorebookEntry`: `{ id, displayName?, category?, text?, … }`;
  `LorebookCategory`: `{ id, name?, … }`.

## Reactivity mechanism (JSX-specific)

The SUI rebuilds the body imperatively after each bind. JSX derives it reactively:
loaded lorebook `entries` are local `useState` (set on load/refresh), but the
**managed set changes in the store** on each bind. Read it as a primitive:

```ts
const managedKey = useSlice((s) =>
  Object.values(s.world.entitiesById)
    .map((e) => e.lorebookEntryId)
    .filter((id): id is string => !!id)
    .sort()
    .join(","),
);
```

`managedKey` is a stable string that changes when bindings change → re-render →
recompute `unmanaged = entries.filter((e) => !managedSet.has(e.id))` from
`managedKey` in render. No `_rebuildBody`.

## Components — `src/ui-jsx/panels/import/`

### `import-data.ts` — pure helpers + loader hook

Pure (unit-tested):
```ts
export const DULFS_SHORT: Record<DulfsFieldID, string> = {
  dramatisPersonae: "Char", universeSystems: "Sys", locations: "Loc",
  factions: "Fac", situationalDynamics: "Dyn", topics: "Topic",
};

/** Entries not bound to any SE entity (managedIds = set of bound lorebookEntryIds). */
export function unmanagedEntries(entries: LorebookEntry[], managedIds: Set<string>): LorebookEntry[];

/** Grouped by entry.category, named categories alphabetical by display name,
 *  "uncategorized" last. Returns [{ key, label, entries }]. */
export function groupAndSortEntries(
  entries: LorebookEntry[],
  categoryNames: Map<string, string>,
): { key: string; label: string; entries: LorebookEntry[] }[];
```

Hook `useImportData()` returns `{ memText, anText, entries, categoryNames, loading, refresh }`:
loads memory/an/lorebook on mount (async, cancelled-guarded), exposes `refresh()`
that reloads lorebook (entries+categories) and re-sets state. `categoryNames` is a
`Map<id, name>`.

### `ImportFoundation.tsx`

Props `{ memText: string; anText: string }`. Local `useState` `attgDone`/`styleDone`.
- Memory→ATTG row (only if `memText.trim()`): label, truncated preview, Import
  button (dispatches attg actions + `api.v1.memory.set` + `setAttgDone(true)`);
  when done → dimmed + "Imported ✓".
- A/N→Style row (only if `anText.trim()`): analogous with style actions + `setStyleDone`.
- Story→Shape+Intent row (always): a Shape button (`shapeGenerationRequested()`)
  and an Intent button (`intentGenerationRequested()`).

### `ImportLorebook.tsx`

Props `{ entries: LorebookEntry[]; categoryNames: Map<string,string>; onBound: () => void }`.
- `managedKey` via `useSlice` (above) → `managedSet` → `unmanaged`.
- Local `dulfsMap` state: `Record<entryId, DulfsFieldID>`; `catFor(entry)` returns
  `dulfsMap[id] ?? detectCategory(entry.text ?? "")`.
- Empty states (unmanaged empty): distinguish "no entries at all" vs "all bound".
- Else `groupAndSortEntries(unmanaged, categoryNames)`; per group a header, per
  entry a row: name, DULFS cycle button (`${DULFS_SHORT[catFor(entry)]} ▶`, click
  → `setDulfsMap({ ...m, [id]: cycleDulfsCategory(catFor(entry)) })`), ⚡ Bind
  button (dispatch `entityBound` with `categoryId: catFor(entry)`, toast, no manual
  refresh needed — `entityBound` updates the store, `managedKey` changes, the row
  drops out). `onBound` is optional (parent may want to know; not required for
  reactivity).

### `ImportWizard.tsx`

Props `{ onClose: () => void }`. Calls `useImportData()`. Renders:
- Header row: Back (`onClose`), "Import Existing Content" title, Refresh
  (`data.refresh()` + toast), **Import All** button.
- `ImportFoundation` (memText/anText), then `ImportLorebook` (entries/categoryNames).
- **Import All**: ATTG (if memText), Style (if anText), `entitiesBoundBatch` of the
  current unmanaged (compute from a fresh `store.getState()` managed set),
  `shapeGenerationRequested()`, `intentGenerationRequested()`, then `onClose()`.
- Scrollable (the Story Engine tab wrapper already sets `overflow: auto`).

### Header + StoryEngine wiring

- `Header.tsx`: add a Download-icon **Import** button (feather `Download`, size
  only) → calls a new `onOpenImport` prop.
- `StoryEngine.tsx`: `const [importOpen, setImportOpen] = useState(false)`; pass
  `onOpenImport={() => setImportOpen(true)}` down through `Header`. When
  `importOpen`, early-return `<ImportWizard onClose={() => setImportOpen(false) />`
  (a full-view takeover, before the Foundation/World stack; the entity/thread
  edit-pane returns stay above it or below — put the import check after the
  edit-pane checks so an open edit pane still wins, matching that they use the
  shared view slot).

## Tasks

1. `import-data.ts` — `unmanagedEntries`, `groupAndSortEntries`, `DULFS_SHORT` (unit-tested) + `useImportData` hook.
2. `ImportFoundation.tsx` — the three foundation rows.
3. `ImportLorebook.tsx` — reactive unmanaged, grouped rows, category cycle + bind.
4. `ImportWizard.tsx` shell (header + Import All) + `Header` Import button + `StoryEngine` open/close wiring + CHANGELOG.

## Testing

- `tests/ui-jsx/import-data.test.ts` (new):
  - `unmanagedEntries` filters out entries whose id is in the managed set; keeps others.
  - `groupAndSortEntries`: groups by `category`; named categories sorted by display
    name; `undefined`/missing category bucketed as "uncategorized" and placed last;
    label resolves from `categoryNames` (falls back to key).
- Tasks 2–4: tsc-gated + whole-slice live-verify.
- Live-verify (on the **Story Engine (JSX)** tab — confirm icon-only S.E.G.A.):
  header **Import** button opens the wizard; Memory→ATTG / A/N→Style import and
  mark done; a lorebook entry's category cycles and **Bind** creates a live entity
  (it disappears from the unmanaged list and appears in the World); **Import All**
  binds the rest + triggers Shape/Intent and closes; **Back** closes without changes.

## Risks / Notes

- **`useSlice` returns primitives** — `managedKey` is a joined-sorted string, not a
  Set. Loaded lorebook data is local `useState`, not a selector.
- **Bind reactivity**: `entityBound` changes `world.entitiesById` → `managedKey`
  changes → the bound row drops out with no manual rebuild.
- **DULFS category** is a local wizard concern (`dulfsMap`) seeded by
  `detectCategory`; only committed to the store at Bind time as the entity's
  `categoryId`.
- **Async loads** are cancelled-guarded (mirror other JSX async effects).
- **Open state is local** to StoryEngine (transient across a Chat-tab switch);
  reopen via the Import button. The import view sits in the same early-return slot
  as the edit panes — an open edit pane still takes precedence.
- **Toast**: `api.v1.ui.toast(message, { type })` is available in the UI runtime.
