# JSX Lorebook Content Refine

**Date:** 2026-07-23
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX `EntityEditPane` can **generate** lorebook content/keys but has no
**refine** — the SUI `SeLorebookContentPane` offered a ⚡/✎ pair where ✎ opens a
refine chat that rewrites the entry text. The refine backend already supports
`lorebookContent` end-to-end: `uiChatRefineRequested({ fieldId, sourceText,
entryId })` opens a refine chat with `refineTarget: { fieldId, originalText,
entryId }`, and the refine's commit dispatcher writes the refined text to **both**
the lorebook entry (`api.v1.lorebook.updateEntry`) and the shared
`CONTENT_DRAFT_KEY`. So this slice is a **UI trigger only** — add the ✎ button to
the JSX entity pane.

## Goal

Make the Content **⚡ (Zap)** button in `EntityEditPane` **adaptive** — like the
Foundation `FieldCard`: on **empty** content it **generates**; on **populated**
content it opens the **refine** view. No separate ✎ button. The refine reuses the
existing refine chat targeting the entry's lorebook content, and commits the
pane's current edits first (so nothing is lost when the pane unmounts).

## Non-Goals

- Any backend/refine-engine change (reuse the existing refine flow).
- A separate ✎/generate pair — the single Zap adapts by content state.
- The `SeLorebookContentPane`'s **Unbind** action (explicitly dropped).
- Fixing the refine-effect dedup (it keys on `fieldId` only, so concurrent
  `lorebookContent` refines for different entities would collide — a pre-existing
  edge case identical to SUI; out of scope).

## Reference behavior (verified)

- `uiChatRefineRequested` effect (`chat-effects.ts:173`) destructures
  `{ fieldId, sourceText, entryId }` and creates the refine chat with
  `refineTarget: { fieldId, originalText: sourceText, entryId }`; `chatCreated`
  foregrounds it, and the JSX `App` effect switches to the Chat tab on a `refine`
  chat's creation.
- Refine commit dispatcher for `lorebookContent` (`refine.ts:50`): sets
  `CONTENT_DRAFT_KEY` and `api.v1.lorebook.updateEntry(entryId, { text })`.
- The JSX `App` renders `{tab === "chat" ? <Chat/> : <StoryEngine/>}`, so
  switching to the Chat tab **unmounts** `StoryEngine` (and `EntityEditPane`).
  Returning to the Story Engine tab (on refine commit/discard, which the `App`
  effect handles) **remounts** `EntityEditPane`, whose mount effect re-seeds
  `content`/`keys`/`alwaysOn` from the lorebook entry — so the refined content is
  reflected and a later Save cannot clobber it with a stale draft.

## Mechanism

Because the pane unmounts when the refine opens, any local draft (name, summary,
content, keys, always-on) would be lost. So the refine button first **flushes the
pane to the store/lorebook** (the same commit `onSave` performs, minus `close()`),
then dispatches the refine. On return, the pane remounts and re-seeds everything
(committed name/summary from the store; refined content from the lorebook). Net:
clicking Content-refine commits the current entity edits and opens the refine —
no data loss, no stale clobber.

## Change — `src/ui-jsx/panels/world/EntityEditPane.tsx`

New import: `uiChatRefineRequested` (from `../../../core/store`). No new icon —
the existing Content `Zap` is reused.

1. **Extract a flush helper** from `onSave`. Move the async commit body of
   `onSave` into:
   ```ts
   const flushToStore = async (): Promise<string | undefined> => {
     const newName = name.value.trim() || entity.name;
     const newSummary = summary.value.trim();
     const oldName = entity.name;
     store.dispatch(entityEdited({ entityId, name: newName, summary: newSummary }));
     for (const u of propagateNameInSummaries(
       Object.values(store.getState().world.entitiesById), entityId, oldName, newName,
     )) {
       store.dispatch(entitySummaryUpdated({ entityId: u.entityId, summary: u.summary }));
     }
     const liveId = await ensureLiveEntryId(entityId);
     if (liveId) {
       const erato = (await api.v1.config.get("erato_compatibility")) || false;
       await api.v1.lorebook.updateEntry(liveId, {
         displayName: newName,
         text: applyEratoPrefix(content.value, !!erato),
         keys: withNameKeyFirst(parseKeys(keys.value), newName),
         forceActivation: alwaysOn,
       });
     }
     return liveId;
   };
   ```
   `onSave` becomes `void (async () => { await flushToStore(); close(); })();`
   (behavior-preserving).

2. **Refine handler**:
   ```ts
   const onRefineContent = () => {
     void (async () => {
       const liveId = await flushToStore();
       if (!liveId) return;
       store.dispatch(
         uiChatRefineRequested({
           fieldId: "lorebookContent",
           sourceText: content.value,
           entryId: liveId,
         }),
       );
     })();
   };
   ```

3. **Adaptive Content Zap.** Replace the existing Content generate button's
   `onClick`/`title` so the single ⚡ chooses its action by content state
   (`contentPopulated = content.value.trim() !== ""`):
   ```tsx
   const contentPopulated = content.value.trim() !== "";
   ...
   <button
     title={
       contentGen.pending
         ? "Generating…"
         : contentPopulated
           ? "Refine content"
           : "Generate content"
     }
     onClick={contentPopulated ? onRefineContent : contentGen.onGenerate}
     disabled={loading || contentGen.pending}
     style={genZapStyle(contentGen.pending)}
   >
     <Zap size={ICON_SIZE} />
   </button>
   ```
   `disabled={loading || contentGen.pending}` guards the pre-seed window (while
   `loading`, `content.value` is `""`, so without this guard the Zap would read as
   "Generate" and could overwrite the entry's real content before it's loaded).
   No promotion guard is needed on refine: for a manually-authored draft (content
   typed, no lorebook entry yet), `flushToStore`'s `ensureLiveEntryId` promotes it
   before the refine dispatch, so refine always has a live `entryId`.

## Testing

- tsc-gated + live-verify (no unit tests — single reactive UI change).
- Live-verify (on the **Story Engine (JSX)** tab — confirm icon-only S.E.G.A.):
  - **Empty** content (a fresh entity) → Content ⚡ tooltip reads "Generate
    content"; click generates as before.
  - **Populated** content (a live entity, or after a generation completes) → ⚡
    tooltip reads "Refine content"; click opens a "Refining: lorebookContent" chat
    on the Chat tab, seeded with the current content. Type a change and **Commit**
    → returns to the Story Engine; reopen the entity → the Content textarea shows
    the refined text.

## Risks / Notes

- **Refine commits the pane**: clicking ✎ flushes name/summary/content/keys (Save
  without close) before opening the refine, so no local drafts are lost when
  `StoryEngine` unmounts. This is intended and matches "refine my current content".
- **Stale-clobber avoided** by the unmount/remount re-seed (see Reference
  behavior) plus the dispatcher's `CONTENT_DRAFT_KEY` write.
- **Dedup edge case** (concurrent `lorebookContent` refines collide) is
  pre-existing and identical to SUI — not addressed here.
- **Adaptive by content, not lifecycle**: the Zap switches on
  `content.value.trim()`, not on draft/live — a manually-authored draft with
  content refines (promoting via `flushToStore`), matching the "populated ⇒
  refine" rule. Empty content always generates.
