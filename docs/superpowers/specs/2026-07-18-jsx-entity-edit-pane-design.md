# JSX Entity Edit Pane — Static Editing

**Date:** 2026-07-18
**Status:** Approved (design)
**Branch:** v14

## Context

The SUI→JSX migration has landed Chat, Foundation, and the World display layer.
The World display renders entity/thread cards but deferred creation and editing:
add-entity, add-thread, and card-name-click render shown-but-disabled. This slice
migrates the **entity editor** — SUI's `SeEntityEditPane` (580 lines) — so entities
can be created and authored, and wires the two deferred entity affordances
(add-entity, card-name-click) to open it.

`SeEntityEditPane` has two halves:

- **Static editing** (this slice): category, name, summary, lorebook content,
  keys, Always-On, Delete, Save (incl. draft→live promotion + name propagation).
- **Generate buttons** (deferred): 3 zap buttons (summary/content/keys) that
  **stream** generated text into the open pane. Streaming lorebook/summary text
  into JSX is an unsolved TODO (only chat streaming is done — see the
  `jsx-streaming-flush` memory). These render **shown-disabled** here; the card's
  regen bolt already generates for _live_ entities, so the authoring loop is
  complete without them.

## Goals

- A JSX `EntityEditPane` reachable from add-entity and card-name-click, opened via
  the existing `ui.activeEditId` store singleton.
- Edit: 6-category picker, name, summary, lorebook content, comma-keys, Always-On.
- Save: `entityEdited` + propagate a name change through other entities'
  summaries + **draft→live promotion** (`ensureCategory` → `createEntry` → bind) +
  flush content/keys/always-on to the lorebook (`updateEntry`, erato prefix,
  `withNameKeyFirst`). Delete (confirm) → `entityDeleted`.
- EntityCard's **green "complete" border** (async lorebook read), deferred from
  the display slice, now that entities are completable.

## Non-Goals

- No in-pane generation streaming — the 3 generate zap buttons are shown disabled.
- No thread edit pane (later slice); add-thread stays disabled.
- No new store slices/reducers — every action/selector used already exists
  (`entityForged`, `entityEdited`, `entityCategoryChanged`,
  `entityLorebookEntryBound`, `entitySummaryUpdated`, `entityDeleted`,
  `uiEditableActivate`, `uiEditableDeactivate`).
- No storyStorage draft slots — JSX uses local `useDraftField` (per the
  established pattern; storyStorage doesn't round-trip reliably mid-session).

## Reference behavior (from SUI `SeEntityEditPane`, verified)

- **Header**: back (`arrow-left`) → close; bold entity name; Delete (confirm,
  "Delete entity?"); Save.
- **Category bar**: 6 buttons — Characters/Systems/Locations/Factions/Vectors/
  Topics (icons user/cpu/map-pin/shield/activity/hash). Click → `entityCategoryChanged`;
  selected highlighted.
- **Name** input (SUI: storageKey `EDIT_PANE_TITLE`).
- **Summary**: "Summary" label + gen zap (`uiEntitySummaryGenerationRequested`) +
  multiline (storageKey `EDIT_PANE_CONTENT`).
- **Lorebook**: divider; "Content" label + content gen/refine pair + multiline
  (storageKey `CONTENT_DRAFT_KEY`); "Keys" row: label + keys input (storageKey
  `KEYS_DRAFT_KEY`) + keys gen zap + "Always On" toggle.
- **`_ensureLiveEntryId`** (draft→live): if `lorebookEntryId` exists → return it;
  else `ensureCategory(entity.categoryId)` → `api.v1.lorebook.createEntry({ id,
displayName, text:"", keys:[nameKey(name)], enabled:true, category })` →
  `entityLorebookEntryBound({ entityId, lorebookEntryId })`. (SUI also dispatches
  `uiLorebookEntrySelected` for streaming routing — **omitted here** since
  generation is deferred; the generation slice re-adds it.)
- **Save** (`_save`): read name/summary; `entityEdited({ entityId, name, summary })`;
  if name changed, regex-replace old name → new in every _other_ entity's summary
  via `entitySummaryUpdated`; `_ensureLiveEntryId`; then `updateEntry(liveId, {
displayName, text: erato ? "----\n"+content : content, keys:
withNameKeyFirst(enteredKeys, name), forceActivation: alwaysOn })`. `erato` =
  `api.v1.config.get("erato_compatibility")`.
- **Delete**: `entityDeleted({ entityId })` + close.
- **On open**: seed name/summary from the entity (store); if `lorebookEntryId`,
  read `api.v1.lorebook.entry(id)` → seed content (`entry.text`), keys
  (`entry.keys.join(", ")`), Always-On (`entry.forceActivation`).

## File Layout

- Create `src/ui-jsx/panels/world/entity-edit.ts` — pure helpers:
  - `parseKeys(raw: string): string[]` — split on `,`, trim, drop empties.
  - `applyEratoPrefix(content: string, erato: boolean): string` — prepend
    `"----\n"` when erato and content is non-empty and not already prefixed.
  - `propagateNameInSummaries(entities: WorldEntity[], entityId: string, oldName:
string, newName: string): Array<{ entityId: string; summary: string }>` —
    the regex name-replacement, returning only the entities whose summary changed
    (excludes the edited entity). Case-insensitive, regex-escaped old name.
- Create `src/ui-jsx/panels/world/EntityEditPane.tsx` — the pane.
- Create `src/ui-jsx/panels/StoryEngine.tsx` — the engine-tab orchestrator.
- Modify `src/ui-jsx/panels/world/world-select.ts` — `entityBorderKind` gains a
  `complete` param + `"complete"` kind.
- Modify `src/ui-jsx/panels/world/EntityCard.tsx` — async completeness border +
  clickable name (`uiEditableActivate`).
- Modify `src/ui-jsx/panels/world/World.tsx` — enable add-entity.
- Modify `src/ui-jsx/components/ConfirmButton.tsx` — optional `label` prop (for
  the pane's labeled "Delete").
- Modify `src/ui-jsx/App.tsx` — render `<StoryEngine/>` in the engine tab.
- Tests: `tests/ui-jsx/entity-edit.test.ts`; extend `tests/ui-jsx/world-select.test.ts`.

## StoryEngine Orchestrator

```
const editId = useSlice((s) => s.ui.activeEditId);
const isEntity = useSlice((s) => (editId ? !!s.world.entitiesById[editId] : false));
return editId && isEntity
  ? <EntityEditPane entityId={editId} />
  : <div column gap:md> <Foundation/> <World/> </div>;
```

`activeEditId` is guarded by `entitiesById` membership so only entity edits route
here (thread edits come later). App's engine-tab body renders `<StoryEngine/>`
inside the existing `overflow:auto` box; the tab shell / Chat branch are untouched.

## Open / Close

- **World add-entity** (no longer disabled): dispatch
  `entityForged({ entity: { id: uuid, categoryId: DramatisPersonae, name:"",
summary:"", lifecycle:"draft" } })` then `uiEditableActivate({ id })`.
- **EntityCard name** (now clickable): `uiEditableActivate({ id: entityId })`.
- **Pane back/save/delete**: `uiEditableDeactivate()`.
- Back on a never-saved fresh draft leaves the draft (matches SUI; discardable
  from the card's trash button).

## EntityEditPane Details

Local `useDraftField` for name, summary, content, keys; local `useState` for
Always-On and category (seeded from the entity) and a `loading` flag. On mount, a
`useEffect` reads the lorebook entry (when `lorebookEntryId` set) and seeds
content/keys/always-on; until then those inputs render empty/disabled. Name and
summary seed synchronously from the store entity.

The 3 generate zap buttons render disabled (dimmed, `cursor:default`, no
`onClick`), matching the display slice's deferred-affordance styling.

Colors: theme tokens only. Category "selected" highlight uses `T.textHeadings` on
a `T.bg3` chip (matching the JSX Intensity picker, replacing SUI's green literal).
Always-On "on" uses `T.midIntensity`.

## Complete Border

`world-select.entityBorderKind(entity, pending, complete)`:

- draft → `"draft"`; else pending → `"pending"`; else complete → `"complete"`;
  else `"incomplete"`.

`EntityCard`: `const [complete, setComplete] = useState(false)`; a `useEffect`
keyed on `[entity, pending]` fetches the lorebook entry (skip when draft / no
`lorebookEntryId` → `false`) and sets `complete = !!entity.summary && !!entry.text
&& (entry.forceActivation || (entry.keys?.length ?? 0) > 0)`. Because `entityEdited`
produces a new entity object, a Save changes the `entity` ref → the effect
re-fetches → the border refreshes. `borderColor("complete")` → `T.midIntensity`.

## ConfirmButton `label`

Add optional `label?: string`. When present, the button renders the label text
(idle) and the confirm prompt when armed, alongside/instead of the icon. The
entity-discard and world-clear callers stay icon-only (omit `label`); the pane's
Delete passes `label: "Delete"`.

## Testing

- `entity-edit.ts` pure functions (vitest):
  - `parseKeys`: `"a, b ,,c"` → `["a","b","c"]`; `""` → `[]`.
  - `applyEratoPrefix`: erato+non-empty+unprefixed → prefixed; already-prefixed →
    unchanged; erato false → unchanged; empty → unchanged.
  - `propagateNameInSummaries`: renames old→new (case-insensitive) in other
    entities' summaries; excludes the edited entity; returns only changed ones;
    regex-escapes special chars in the old name.
- `world-select.test.ts`: extend `entityBorderKind` — live+complete → "complete";
  live+pending → "pending" (pending wins over complete); draft → "draft".
- Components: `npx tsc --noEmit` gate + live-harness verification (open via
  add-entity and name-click; edit each field; category switch; Save promotes a
  draft to live + green border appears; name-propagation into a referencing
  summary; Delete-confirm; disabled generate buttons; Always-On toggle round-trips
  through Save).

## Risks / Notes

- **Async seed race**: the lorebook read is async; the pane must not clobber a
  user edit made before the read resolves. Seed content/keys/always-on only once,
  on the initial load, and disable those inputs until `loading` clears.
- **Name-propagation** dispatches one `entitySummaryUpdated` per changed entity —
  the pure `propagateNameInSummaries` computes the set; the component dispatches.
- **No storyStorage** — all drafts local; Save reads local state, not storyStorage.
- **`_ensureLiveEntryId`** lives in the component (it dispatches + calls the
  lorebook API); its create-vs-return-existing branch is the single promotion path
  for Save.
