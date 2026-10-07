# JSX Entity Pane — Summary Generation + Streaming

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX entity edit pane (`EntityEditPane`) has three generate buttons rendered
disabled (summary / lorebook content / lorebook keys) — streaming into the open
pane was unsolved. The foundation-streaming slice proved the shared-handler →
`stream-buffer` → `useStream` pattern for _display_. This slice applies it to the
first, simplest pane generate button — **Summary** — which additionally requires
**draft-staging** (the pane holds an editable draft, and "Back discards" must
hold, so generation must not commit to the store; the buffer carries the final
text into the editable draft, and Save commits).

Summary is the simple case: no lorebook entry, no draft→live promotion, no
`selectedEntryId` gating, no prefill. Content + Keys (the lorebook pair) are the
next slice.

## Goals

- Enable the Summary generate button in `EntityEditPane`: click generates, tokens
  stream live into the summary textarea, and on completion the generated text
  lands in the **editable draft** (staged — Back discards, Save commits).
- Dual-write, non-destructive: keep the SUI sinks; add `stream-buffer` writes.

## Non-Goals

- Content / Keys generation (the lorebook pair) — next slice; those buttons stay
  disabled.
- Foundation streaming (done) / list streaming.
- Removing SUI sinks.

## Reference behavior (SUI `entitySummaryHandler`, verified)

- `streaming`: `storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText)`.
- `completion` (succeeded): `trimmed = accumulatedText.trim()`; if the pane is
  open (`ui.activeEditId === target.entityId`) stage in `storyStorage`
  (`EDIT_PANE_CONTENT`); else `dispatch(entitySummaryUpdated({ entityId, summary }))`
  (background commit to the store).
- Effect `uiEntitySummaryGenerationRequested({ entityId, requestId })` is
  registered (`effects/summary-generation.ts`) and queues the generation; the
  request id the pane uses is `` `se-entity-summary-${entityId}` ``.
- Streaming is NOT gated by `selectedEntryId` (unlike lorebook content).

## Mechanism — buffer carries the final into the draft

Foundation cards clear the buffer on completion and fall back to the **store**
(the source of truth for a display). The pane is an **editable draft**, so:

- The handler dual-writes to the buffer key `` `entity-summary:${entityId}` `` —
  per-token in `streaming`, and the **final trimmed text** in `completion`. It
  does NOT clear the buffer (the pane owns clearing) and, when the pane is open,
  does NOT commit to the store (Back must discard).
- The pane, while its summary request is pending, disables the textarea and shows
  `useStream(key)` (live). On completion it **stages** the final buffer text into
  the editable `summary` draft, then clears the buffer. Save commits; Back
  discards (the store was never touched by generation).

## Handler change — `src/core/store/effects/handlers/summary.ts` (`entitySummaryHandler` only)

- Import `writeStream` from `../../stream-buffer`.
- `streaming`: keep the `storyStorage.set(EDIT_PANE_CONTENT, …)`; add
  `writeStream(\`entity-summary:${ctx.target.entityId}\`, ctx.accumulatedText)`.
- `completion` (inside the existing `if (succeeded && accumulatedText)`): compute
  `trimmed`; add `writeStream(\`entity-summary:${ctx.target.entityId}\`, trimmed)`**before** the existing pane-open branch (storyStorage stage vs`entitySummaryUpdated`). Do not clear the buffer here. (Only `entitySummaryHandler`changes;`entitySummaryBindHandler`/`threadSummaryHandler` are untouched.)

## Helper — `src/ui-jsx/panels/world/world-select.ts`

Add a single-id pending check and DRY `entityPending` onto it:

```ts
export function isRequestActive(
  runtime: RootState["runtime"],
  requestId: string,
): boolean {
  return (
    runtime.activeRequest?.id === requestId ||
    runtime.queue.some((q) => q.id === requestId) ||
    runtime.sega.activeRequestIds.includes(requestId)
  );
}
```

Refactor `entityPending` to `entityRequestIds(entityId).some((id) => isRequestActive(runtime, id))` — behavior-preserving; the existing `entityPending` tests still pass.

## `EntityEditPane.tsx` change (Summary section only)

New imports: `useStream` (from `../../bridge`); `uiEntitySummaryGenerationRequested`
(from `../../../core/store`); `clearStream` (from `../../../core/store/stream-buffer`);
`isRequestActive` (from `./world-select`).

Hooks (placed with the other hooks, before the `if (!entity) return null` guard):

```ts
const summaryReqId = `se-entity-summary-${entityId}`;
const summaryKey = `entity-summary:${entityId}`;
const summaryPending = useSlice((s) =>
  isRequestActive(s.runtime, summaryReqId),
);
const summaryLive = useStream(summaryKey);
const genRef = useRef(false);

// Wipe a stale background buffer on open (so the display shows the seeded draft),
// and clean up on unmount.
useEffect(() => {
  clearStream(summaryKey);
  return () => clearStream(summaryKey);
}, []);

// Stage the final streamed summary into the editable draft when a pane-triggered
// generation finishes. genRef guards against mount/stale auto-transfer; the
// [pending, live] deps make it order-independent (fires once both the request has
// cleared and the final text is in the buffer).
useEffect(() => {
  if (genRef.current && !summaryPending && summaryLive !== undefined) {
    summary.setValue(summaryLive);
    clearStream(summaryKey);
    genRef.current = false;
  }
}, [summaryPending, summaryLive]);
```

Handler:

```ts
const onGenerateSummary = () => {
  if (summaryPending) return;
  genRef.current = true;
  clearStream(summaryKey);
  store.dispatch(
    uiEntitySummaryGenerationRequested({ entityId, requestId: summaryReqId }),
  );
};
```

Summary section: replace the disabled zap button with an enabled one
(`onClick={onGenerateSummary}`, `disabled={summaryPending}`, dim while pending),
and the textarea gets `disabled={summaryPending}` and
`value={summaryLive ?? summary.value}`. Content/Keys buttons stay disabled.

## Testing

- `tests/core/store/effects/handlers/summary.test.ts` (new):
  - `streaming` writes `ctx.accumulatedText` to `readStream("entity-summary:e1")`,
    no dispatch (storyStorage is the global test mock).
  - `completion` pane-CLOSED (`getState().ui.activeEditId !== entityId`) writes the
    trimmed final to the buffer AND dispatches `entitySummaryUpdated`.
  - `completion` pane-OPEN (`activeEditId === entityId`) writes the trimmed final
    to the buffer AND does NOT dispatch (stages storyStorage).
- `tests/ui-jsx/world-select.test.ts` (extend): `isRequestActive` true when the id
  is in `activeRequest` / `queue` / `sega.activeRequestIds`, false otherwise; the
  existing `entityPending` tests still pass (refactor is behavior-preserving).
- `EntityEditPane` is tsc-gated + live-verified (generate a summary in the pane →
  tokens stream into the textarea → the text lands in the editable draft → edit +
  Save commits; Back before Save discards).

## Risks / Notes

- **No store commit on pane-open generation** — the buffer carries the final into
  the draft; the store is untouched until Save, preserving Back-discards. This
  differs from the foundation card (which is display-only and does commit to
  store).
- **Stale buffer**: a background summary gen (card regen, pane closed) leaves a
  buffer entry with no reader; the pane's mount `clearStream` wipes it on next
  open, so it never leaks into the display. `genRef` ensures it never
  auto-transfers.
- Hooks must precede the `if (!entity) return null` early return (rules of hooks).
- `useStream`/`isRequestActive` return primitives — no `useSlice` loop risk.
