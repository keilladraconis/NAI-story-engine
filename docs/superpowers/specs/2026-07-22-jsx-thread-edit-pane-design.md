# JSX Thread Edit Pane

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX World layer renders Threads (`WorldGroup`) read-only: `ThreadItem` shows
the title, a disabled lorebook toggle, an inline delete, and member entity cards.
There is no way to **create** a thread (the add-thread button is disabled) or
**edit** one (the title is non-interactive). This slice adds a JSX thread edit
pane — the counterpart to the just-completed `EntityEditPane` — so threads can be
created, titled, summarized (with generation), and have their membership managed.

It is a close mirror of the entity pane and reuses the shared `useGenField` /
`stream-buffer` staging mechanism proven in the Summary and Content+Keys slices.
Two backend fixes are required, both identical in shape to fixes already made for
entity summary generation.

## Goals

- Enable the add-thread button: create a `WorldGroup` and open the edit pane.
- New `ThreadEditPane`: title + summary drafts (committed on Save), summary
  generation via `useGenField`, and immediate member on/off toggles.
- Route `activeEditId` to `ThreadEditPane` when it names a group.
- Make the `ThreadItem` title open the pane.
- Backend: `threadSummaryHandler` dual-write to the stream buffer; fix the
  `uiThreadSummaryGenerationRequested` effect to register the request in the
  runtime queue.

## Non-Goals

- Thread lorebook-sync toggle and thread reforge — the SUI thread pane
  (`SeThreadEditPane`) is title/summary/members only. `ThreadItem`'s lorebook
  toggle stays disabled (a later slice).
- A Delete button in the pane — delete already lives on the `ThreadItem` card.
- Removing SUI sinks (the handler keeps writing `EDIT_PANE_CONTENT`).

## Reference behavior (verified)

- **SUI add-thread** (`SeWorldSection.ts:228`): `groupCreated({ group: { id,
title: "", summary: "", entityIds: [] } })` then opens `SeThreadEditPane`. No
  draft lifecycle — the group is committed immediately (matches how JSX draft
  entities persist on Back).
- **SUI `SeThreadEditPane`**: header (back, title, save), title `textInput`,
  summary `multilineTextInput` + a `SeGenerationIconButton`, and a members
  `SuiSectionedList` grouped by category with `SuiToggle`s. Title/summary commit
  on Save (`groupRenamed` + `groupSummaryUpdated`); membership toggles dispatch
  `entityGroupToggled` immediately.
- **`uiThreadSummaryGenerationRequested` effect** (`summary-generation.ts:220`):
  dispatches `generationSubmitted` with `createThreadSummaryFactory` +
  `target: { type: "threadSummary", groupId }`, `max_tokens: 100`, temp 0.9,
  min_p 0.05, `prefillBehavior: "trim"`. **It does NOT call `requestQueued`** —
  the same defect that caused entity-summary data loss.
- **`threadSummaryHandler`** (`handlers/summary.ts:85`): `streaming` writes
  `EDIT_PANE_CONTENT`; `completion` (on success) writes the trimmed text to
  `EDIT_PANE_CONTENT`. No stream-buffer write, no failure branch. Thread summary
  is only ever generated from the open pane — there is no thread-card regen path,
  so (unlike entity summary) there is no background `...Updated` dispatch branch.
- **`createThreadSummaryFactory`** (`summary-strategy.ts:153`): reads
  `group.title` and members from the **store** (`state.world.groups` /
  `entitiesById`), NOT from `EDIT_PANE_TITLE` storyStorage. So the
  storyStorage-title-mirror fix from the entity pane does **not** apply here.
- Request/target type `"threadSummary"` already exists (`types.ts:82,124`).
- `useGenField`, `useDraftField`, `uiEditableActivate`/`uiEditableDeactivate`,
  `groupCreated`/`groupRenamed`/`groupSummaryUpdated`/`groupDeleted`/
  `entityGroupToggled` are all present and exported.

## Handler change — `src/core/store/effects/handlers/summary.ts`

`writeStream`/`clearStream` are already imported. In `threadSummaryHandler`:

- `streaming`: after the `storyStorage.set(EDIT_PANE_CONTENT, ...)`, add
  `writeStream(\`thread-summary:${ctx.target.groupId}\`, ctx.accumulatedText)`.
- `completion`: keep the success `storyStorage.set(EDIT_PANE_CONTENT, trimmed)`;
  add `writeStream(\`thread-summary:${ctx.target.groupId}\`, trimmed)` in the
  success branch, and an `else` branch calling
  `clearStream(\`thread-summary:${ctx.target.groupId}\`)`on failure. (Mirror of`entitySummaryHandler`, minus the pane-open/`...Updated` split — thread summary
  always stages.)

## Effect change — `src/core/store/effects/summary-generation.ts`

In the `uiThreadSummaryGenerationRequested` handler, before `generationSubmitted`,
add an idempotent queue registration (mirror of the entity-summary fix at
lines 46–57):

```ts
const rt = getState().runtime;
const alreadyTracked =
  rt.activeRequest?.id === requestId ||
  rt.queue.some((r) => r.id === requestId);
if (!alreadyTracked) {
  dispatch(
    requestQueued({ id: requestId, type: "threadSummary", targetId: groupId }),
  );
}
```

## UI — `src/ui-jsx/panels/world/ThreadEditPane.tsx` (new)

Mirror `EntityEditPane` structure. Props `{ groupId: string }`.

- `const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId))`;
  render `null` if absent (after hooks).
- Drafts: `title = useDraftField(group?.title ?? "")`,
  `summary = useDraftField(group?.summary ?? "")`.
- `summaryGen = useGenField({ requestId: \`se-thread-summary-${groupId}\`,
  bufferKey: \`thread-summary:${groupId}\`, draft: summary, arm: () =>
  store.dispatch(uiThreadSummaryGenerationRequested({ groupId, requestId:
  \`se-thread-summary-${groupId}\` })) })`.
- Header: Back (`close`), title text shown, Save. `close = () =>
store.dispatch(uiEditableDeactivate())`. No Delete button.
- Title `<input>` (draft), Summary `<textarea>` (draft) with the summary
  generate zap (`onClick={summaryGen.onGenerate}`, dim while `summaryGen.pending`,
  `value={summaryGen.live ?? summary.value}`, `disabled={summaryGen.pending}`).
- **Members**: read all entities from `useSlice((s) => s.world.entitiesById)`
  and show **every** entity (`Object.values`) grouped by category — no forge-draft
  filter, matching SUI `SeThreadEditPane` (which passes `Object.values(
state.world.entitiesById)`; the forge-draft exclusion is a `ThreadItem` _display_
  concern only). For each category with ≥1 entity, render a header + each entity as
  a row with a toggle button reflecting `group.entityIds.includes(entity.id)`; on
  click dispatch `entityGroupToggled({ groupId, entityId })` (immediate). Category
  grouping: reuse the entity pane's category order — the `CATEGORIES` list in
  `EntityEditPane.tsx` is module-private, so either export it for reuse or define
  an equivalent local list in `ThreadEditPane.tsx` (plan's choice; DRY-favor
  exporting).
- `onSave`: `groupRenamed({ groupId, title: title.value.trim() })` +
  `groupSummaryUpdated({ groupId, summary: summary.value.trim() })`, then
  `close()`.

## UI — `src/ui-jsx/panels/world/World.tsx`

Enable the add-thread button (replace the disabled stub):

```ts
const onAddThread = () => {
  const id = api.v1.uuid();
  store.dispatch(
    groupCreated({ group: { id, title: "", summary: "", entityIds: [] } }),
  );
  store.dispatch(uiEditableActivate({ id }));
};
```

Wire it to the layers button with the active `ICON_BTN` style and title
`"Add thread"`. Import `groupCreated`.

## UI — `src/ui-jsx/panels/StoryEngine.tsx`

Add group routing alongside the entity route:

```ts
const isThread = useSlice((s) =>
  editId ? s.world.groups.some((g) => g.id === editId) : false,
);
...
if (editId && isEntity) return <EntityEditPane entityId={editId} />;
if (editId && isThread) return <ThreadEditPane groupId={editId} />;
```

## UI — `src/ui-jsx/panels/world/ThreadItem.tsx`

Make the title `<span>` a button that dispatches
`uiEditableActivate({ id: groupId })`. Keep the inline delete and disabled
lorebook toggle unchanged.

## Tasks

1. `threadSummaryHandler` dual-write + `uiThreadSummaryGenerationRequested` queue
   fix, with tests (both in the summary test surface).
2. `ThreadEditPane.tsx` — title/summary drafts + Save + summary generation via
   `useGenField` + member toggles.
3. Wire-up: `World.tsx` add-thread, `StoryEngine.tsx` group routing,
   `ThreadItem.tsx` title-opens-pane.

## Testing

- `tests/core/store/effects/handlers/summary.test.ts`: `threadSummaryHandler`
  `streaming` writes `ctx.accumulatedText` to `readStream("thread-summary:g1")`;
  `completion` success writes the trimmed final and (still) sets
  `EDIT_PANE_CONTENT`; `completion` failure clears the buffer.
- `tests/core/store/effects/summary-generation.test.ts` (or the effect's test
  surface): `uiThreadSummaryGenerationRequested` dispatches `requestQueued`
  (type `"threadSummary"`, `targetId` = groupId) before `generationSubmitted`,
  and does NOT double-queue when the id is already tracked.
- `ThreadEditPane` is tsc-gated + live-verified:
  - add-thread creates a thread and opens the pane;
  - type a title + toggle a member (member updates live on the card);
  - Generate summary streams into the textarea and stages into the draft;
  - Save persists title + summary (the CRITICAL fix — full summary, not first
    token); Back before Save discards title/summary but keeps membership toggles.

## Risks / Notes

- **Queue fix is load-bearing**: without it, thread-summary Save loses data
  exactly as entity-summary did. It is the first thing to verify.
- **Membership is not a draft** — toggles commit immediately (matches SUI); only
  title/summary are draft+Save. Back discards title/summary edits but membership
  changes persist. This is intended.
- **Empty thread persists on Back** — add-thread commits the group immediately;
  consistent with JSX draft entities. Delete via the card.
- `createThreadSummaryFactory` reads the store title, so a title typed but not yet
  saved is not reflected in the generated summary. The summary is member/dynamic
  driven, so this is acceptable and matches SUI.
- Hooks (`useDraftField`, `useGenField`, `useSlice`) must precede the
  `if (!group) return null` early return.
