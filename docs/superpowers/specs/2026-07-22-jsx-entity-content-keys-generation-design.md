# JSX Entity Pane — Content + Keys Generation

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX entity edit pane's Summary generate button now streams into the editable
draft (buffer→draft staging, proven live). This slice enables the remaining two
generate buttons — **lorebook Content** and **Keys** — completing the entity
pane's generation surface. They share the summary's buffer→draft mechanism but
add lorebook specifics: **draft→live promotion**, **`selectedEntryId` gating**,
a **prefill** header (content streams prefill + body), and **commit-to-lorebook**
on completion (so content/keys generation is _sticky_, unlike summary).

The three near-identical generate blocks (summary/content/keys) are unified into
a shared `useGenField` hook.

## Goals

- Enable the Content and Keys generate zaps in `EntityEditPane`: click promotes a
  draft entity if needed, streams (content) / commits (keys) generation, and
  stages the result into the editable draft.
- Extract a shared `useGenField` hook; refactor Summary onto it (behavior-preserving).
- Dual-write, non-destructive: keep the SUI sinks (storyStorage draft slots).

## Non-Goals

- Foundation/list streaming; removing SUI sinks.
- Changing the sticky semantics (content/keys commit to the lorebook + promote on
  generate — matches SUI).

## Reference behavior (verified)

- The `uiLorebookContentGenerationRequested` / `uiLorebookKeysGenerationRequested`
  effects (`effects/lorebook-generation.ts`) **return early if `ui.lorebook.selectedEntryId`
  is null** — so the pane must dispatch `uiLorebookEntrySelected({ entryId })`
  before the request. The engine's `queueLorebookRequestIfNeeded` registers the
  content/keys request in the runtime queue (idempotent), so `isRequestActive`
  works without a summary-style fix.
- `lorebookContentHandler.streaming`: gated by `selectedEntryId === entryId`;
  builds `displayContent = prefill + accumulatedText`; writes it to
  `CONTENT_DRAFT_RAW`. `completion`: `fullContent = prefill + cleaned`; erato
  prefix → `finalContent`; `updateEntry({ text: finalContent })`; seeds a name
  key; if selected, updates `CONTENT_DRAFT_RAW`. Failure: restores original.
- `lorebookKeysHandler.streaming`: no-op. `completion`: parse KEYS line →
  merge existing + generated (dedup) → `withNameKeyFirst` → `updateEntry({ keys })`;
  if selected, updates `KEYS_DRAFT_RAW`. Failure: restores original.
- Request ids: content `` `lb-item-${entryId}-content` ``, keys
  `` `lb-item-${entryId}-keys` `` (= `IDS.LOREBOOK.entry(entryId).CONTENT_REQ/KEYS_REQ`).
- `ensureLiveEntryId(entityId)` (already in the pane) promotes a draft:
  `ensureCategory` → `createEntry` (empty) → `entityLorebookEntryBound`, returning
  the entry id.

## Shared `useGenField` hook — `EntityEditPane.tsx`

```ts
function useGenField(opts: {
  requestId: string; // "" until available (draft with no entry) → not pending
  bufferKey: string; // "" until available
  draft: { value: string; setValue: (v: string) => void };
  arm: () => void; // field-specific dispatch (+ promote/select for lorebook)
}): { pending: boolean; live: string | undefined; onGenerate: () => void } {
  const pending = useSlice((s) =>
    opts.requestId ? isRequestActive(s.runtime, opts.requestId) : false,
  );
  const live = useStream(opts.bufferKey);
  const genRef = useRef(false);

  // Wipe stale buffer on open / when the key changes (post-promotion) + unmount.
  useEffect(() => {
    if (opts.bufferKey) clearStream(opts.bufferKey);
    return () => {
      if (opts.bufferKey) clearStream(opts.bufferKey);
    };
  }, [opts.bufferKey]);

  // Stage the final into the editable draft when a pane-triggered generation
  // finishes (genRef-guarded; order-independent via [pending, live]).
  useEffect(() => {
    if (!genRef.current || pending) return;
    if (live !== undefined) opts.draft.setValue(live);
    if (opts.bufferKey) clearStream(opts.bufferKey);
    genRef.current = false;
  }, [pending, live]);

  const onGenerate = () => {
    if (pending) return;
    genRef.current = true;
    if (opts.bufferKey) clearStream(opts.bufferKey);
    opts.arm();
  };

  return { pending, live, onGenerate };
}
```

Three call sites (unconditional, before the `if (!entity) return null` guard):

- **Summary**: `requestId: \`se-entity-summary-${entityId}\``,
  `bufferKey: \`entity-summary:${entityId}\``, `draft: summary`,
`arm: () => store.dispatch(uiEntitySummaryGenerationRequested({ entityId, requestId: \`se-entity-summary-${entityId}\` }))`.
- **Content**: `eid = entity?.lorebookEntryId ?? ""`;
  `requestId: eid ? \`lb-item-${eid}-content\` : ""`,
  `bufferKey: eid ? \`lb-content:${eid}\` : ""`, `draft: content`,
`arm: () => void (async () => { const id = await ensureLiveEntryId(entityId); if (!id) return; store.dispatch(uiLorebookEntrySelected({ entryId: id, categoryId: null })); store.dispatch(uiLorebookContentGenerationRequested({ requestId: \`lb-item-${id}-content\` })); })()`.
- **Keys**: analogous with `lb-item-${id}-keys` / `lb-keys:${id}` and
  `uiLorebookKeysGenerationRequested`.

The Content/Keys zaps become enabled (`onClick={gen.onGenerate}`, dim while
`gen.pending`); their inputs get `disabled={loading || gen.pending}` and
`value={gen.live ?? draft.value}`. On unmount, dispatch
`uiLorebookEntrySelected({ entryId: null, categoryId: null })` (mirrors SUI close).

Dynamic-key note: for a draft, `eid` is `""` → request id/buffer key are `""`
(not pending, button clickable). `onGenerate`'s `arm` promotes; the store update
(`entityLorebookEntryBound`) re-renders the pane with `entity.lorebookEntryId`
set, so the hook recomputes to the real id and the pending/stream/transfer track
correctly. `genRef` (a ref) survives the re-render.

## Handler changes — `src/core/store/effects/handlers/lorebook.ts`

Import `writeStream`, `clearStream` from `../../stream-buffer`.

- `lorebookContentHandler.streaming`: after `storyStorage.set(CONTENT_DRAFT_RAW, displayContent)`, add
  `writeStream(\`lb-content:${ctx.target.entryId}\`, displayContent)`(still inside
the`selectedEntryId === entryId` gate).
- `lorebookContentHandler.completion`: in the success branch, after
  `const fullContent = prefill + cleaned;`, add
  `writeStream(\`lb-content:${entryId}\`, fullContent)` (pre-erato — the editable
  content; Save re-applies erato). In the `else` (failure) branch, add
  `clearStream(\`lb-content:${entryId}\`)`.
- `lorebookKeysHandler.completion`: in the success branch, after
  `updateEntry({ keys: finalKeys })`, add
  `writeStream(\`lb-keys:${ctx.target.entryId}\`, finalKeys.join(", "))`. In the
  `else` branch, add `clearStream(\`lb-keys:${ctx.target.entryId}\`)`.

Keys `streaming` stays a no-op (so the keys input shows its draft during
generation, disabled, then the final on completion — keys are noisy mid-stream).

## Tasks

1. `lorebookContentHandler` dual-write + test.
2. `lorebookKeysHandler` dual-write + test.
3. `EntityEditPane`: extract `useGenField`, refactor Summary onto it (behavior-preserving).
4. `EntityEditPane`: enable Content + Keys via `useGenField` + unmount `uiLorebookEntrySelected(null)`.

## Testing

- `tests/core/store/effects/handlers/lorebook.test.ts` (extend, if present, or new):
  - content `streaming` (with `selectedEntryId === entryId`) writes
    `prefill+accumulated` to `readStream("lb-content:<id>")`; content `completion`
    success writes `fullContent`; failure clears the key.
  - keys `completion` success writes the joined final keys to
    `readStream("lb-keys:<id>")`; failure clears the key.
  - (The content handler reads config/lorebook via the global `api` test mock;
    `selectedEntryId` is set via the `getState` mock so the streaming gate passes.)
- `EntityEditPane` is tsc-gated + live-verified:
  - **Task 3**: re-confirm Summary still streams into the draft and Save persists
    the full text (the `useGenField` refactor is behavior-preserving).
  - **Task 4**: Content generate on a fresh draft → promotes → streams (prefill +
    body) into the content textarea → completion stages into the draft → Save.
    Keys generate → keys appear in the input on completion. Both commit to the
    lorebook (sticky). Content/Keys disabled while `loading`.

## Risks / Notes

- **Sticky**: content/keys generation commits to the lorebook + promotes the draft
  immediately; Back doesn't undo them (matches SUI). Summary stays staged.
- **`selectedEntryId` is a shared UI singleton** — set on generate, cleared on
  unmount; don't leave it dangling.
- Content buffer carries `fullContent` (pre-erato); Save re-applies erato — no
  double-prefix (`applyEratoPrefix` guards `startsWith("----\n")`).
- `useGenField` calls hooks — all three call sites are unconditional and precede
  the early return.
- `useStream("")` for a not-yet-promoted draft is harmless (returns `undefined`).
