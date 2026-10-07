# JSX Lorebook Content Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `EntityEditPane` Content ⚡ button adaptive — generate on empty content, open a refine chat on populated content — reusing the existing `lorebookContent` refine flow.

**Architecture:** UI-only change in one file. Extract the `onSave` commit body into a `flushToStore()` helper; a populated-content Zap flushes the pane (so no local drafts are lost when the Chat tab unmounts `StoryEngine`) then dispatches `uiChatRefineRequested`. The refine chat, its commit-to-lorebook, and the remount-reseed are all existing behavior.

**Tech Stack:** TypeScript (strict), Preact/JSX (NAI runtime globals — no import), nai-store. QuickJS (no DOM, no setTimeout, no console.log).

## Global Constraints

- No backend/state/prompt changes; no `project.yaml` version bump. The build stamps `updatedAt` — revert it (`git checkout project.yaml`) before committing.
- Single Zap adapts by `content.value.trim()` — no separate ✎ button, no new icon.
- `flushToStore` must be behavior-preserving for `onSave` (extract, don't change semantics).
- Verify live on the **Story Engine (JSX)** tab only (icon-only S.E.G.A.).

---

### Task 1: Adaptive Content Zap (generate ⇄ refine)

**Files:**

- Modify: `src/ui-jsx/panels/world/EntityEditPane.tsx`

**Interfaces:**

- Consumes: `uiChatRefineRequested` (`../../../core/store`) — payload `{ fieldId: string; sourceText: string; entryId?: string }`. Existing `ensureLiveEntryId`, `applyEratoPrefix`, `withNameKeyFirst`, `parseKeys`, `propagateNameInSummaries`, `entityEdited`, `entitySummaryUpdated`.

- [ ] **Step 1: Import `uiChatRefineRequested`**

Add it to the existing `../../../core/store` import block (after `uiLorebookKeysGenerationRequested`):

```ts
  uiLorebookKeysGenerationRequested,
  uiChatRefineRequested,
} from "../../../core/store";
```

- [ ] **Step 2: Extract `flushToStore` from `onSave`**

Current `onSave` (≈ lines 287–318):

```tsx
const onSave = () => {
  void (async () => {
    const newName = name.value.trim() || entity.name;
    const newSummary = summary.value.trim();
    const oldName = entity.name;
    store.dispatch(
      entityEdited({ entityId, name: newName, summary: newSummary }),
    );

    for (const u of propagateNameInSummaries(
      Object.values(store.getState().world.entitiesById),
      entityId,
      oldName,
      newName,
    )) {
      store.dispatch(
        entitySummaryUpdated({ entityId: u.entityId, summary: u.summary }),
      );
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
    close();
  })();
};
```

Replace it with a `flushToStore` helper (the commit body, returning the live id, **no** `close()`) plus a thin `onSave` and the new `onRefineContent`:

```tsx
// Commit the pane's current edits to the store + lorebook (the Save body
// without closing). Returns the live lorebook entry id (promoting a draft if
// needed). Used by Save and by content-refine (which must persist drafts
// before the Chat tab unmounts this pane).
const flushToStore = async (): Promise<string | undefined> => {
  const newName = name.value.trim() || entity.name;
  const newSummary = summary.value.trim();
  const oldName = entity.name;
  store.dispatch(
    entityEdited({ entityId, name: newName, summary: newSummary }),
  );

  for (const u of propagateNameInSummaries(
    Object.values(store.getState().world.entitiesById),
    entityId,
    oldName,
    newName,
  )) {
    store.dispatch(
      entitySummaryUpdated({ entityId: u.entityId, summary: u.summary }),
    );
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

const onSave = () => {
  void (async () => {
    await flushToStore();
    close();
  })();
};

// Populated-content Zap: flush the pane (persist name/summary/content/keys and
// promote a draft), then open the refine chat on the entry's lorebook content.
// The Chat tab unmounts StoryEngine; on return the pane remounts and re-seeds
// the refined content from the lorebook (no stale clobber).
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

- [ ] **Step 3: Make the Content Zap adaptive**

Replace the Content generate button (≈ lines 436–443):

```tsx
<button
  title={contentGen.pending ? "Generating…" : "Generate content"}
  onClick={contentGen.onGenerate}
  disabled={contentGen.pending}
  style={genZapStyle(contentGen.pending)}
>
  <Zap size={ICON_SIZE} />
</button>
```

with:

```tsx
<button
  title={
    contentGen.pending
      ? "Generating…"
      : content.value.trim()
        ? "Refine content"
        : "Generate content"
  }
  onClick={content.value.trim() ? onRefineContent : contentGen.onGenerate}
  disabled={loading || contentGen.pending}
  style={genZapStyle(contentGen.pending)}
>
  <Zap size={ICON_SIZE} />
</button>
```

(`disabled={loading || contentGen.pending}` guards the pre-seed window: while
`loading`, `content.value` is `""`, so without it the Zap would read as
"Generate" and could overwrite the entry's real content before it loads.)

- [ ] **Step 4: tsc + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.
Run: `npx vitest run` → all passing (no new tests; confirms no regression).

- [ ] **Step 5: Update CHANGELOG + commit**

Add to the `## [0.14.0]` `### Added` (or `### Changed`) a release-note bullet: the entity Content ⚡ is now adaptive — it generates lorebook content on an empty entry and opens a refine chat (rewriting the entry) once content exists, mirroring the Foundation fields. Match the existing 0.14.0 voice.

```bash
git add src/ui-jsx/panels/world/EntityEditPane.tsx CHANGELOG.md
git commit -m "feat(jsx): adaptive entity Content zap — generate when empty, refine when populated"
```

---

## Live Verification (after the task, with the user)

On the **Story Engine (JSX)** tab (confirm icon-only S.E.G.A.):

1. Open an entity with **empty** content → the Content ⚡ tooltip reads "Generate content"; clicking generates (streams) as before.
2. Open a **live** entity with content (or wait for a generation to finish) → the ⚡ tooltip reads "Refine content"; click → the Chat tab opens a "Refining: lorebookContent" chat seeded with the current content.
3. Type a change, **Commit** → returns to the Story Engine; reopen the entity → the Content textarea shows the refined text (not the pre-refine text).
4. Confirm the Zap is disabled while content is generating.

## Notes for the executor

- `flushToStore` is a straight extraction of the `onSave` commit body — do not change its behavior; `onSave` must remain equivalent.
- `useState`/`useEffect` are NAI globals — no import. Do not add an icon import (the existing `Zap` is reused).
- Remove any import `noUnusedLocals` flags; do not suppress. Do not bump `project.yaml`.
