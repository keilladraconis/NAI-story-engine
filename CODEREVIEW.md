# Code Review — NAI Story Engine v9

_Written 2026-03-02 after the Crucible (v9) landed._

---

## Overview

The codebase is in good health. Architecture is clear, TypeScript is strict and well-typed, and the core abstractions (nai-store, nai-act, gen-x) are used consistently. The Crucible added significant depth without destabilizing the existing SE pipeline. That said, a few things have accumulated that need attention before BETA: some dead code, a dual-source-of-truth bug, a handful of UI patterns that are copied rather than extracted, and a `generateGoals` button that vanishes when you probably still want it.

This review is organized by priority: **Bugs** → **Dead Code** → **Architecture** → **UI Patterns** → **Testing**.

---

## 1. Bugs & Correctness Issues

### 1.1 Shape Name: Dual Source of Truth ✓ DONE

**File:** `src/core/store/effects/crucible-effects.ts:51`

```ts
const prefillName = String((await api.v1.storyStorage.get("cr-shape-name")) || "").trim() || undefined;
```

Shape name is persisted to `storyStorage` under `"cr-shape-name"` AND lives in `state.crucible.shape.name`. They are kept in sync via a `useSelector` in `ShapeSection`, but this is unnecessary complexity — any interaction that reads the name from storage while state has a different value is a latent bug.

**Fix:** Remove the storage key entirely. When shape generation is triggered, read the prefill name from `getState().crucible.shape?.name` directly. The shape is already persisted via the normal `autosave` cycle.

---

### 1.2 Dead Regex in `formatForDisplay` (Direction Section)

**File:** `src/ui/components/Crucible/IntentSection.ts:13-16`

```ts
function formatForDisplay(raw: string): string {
  const display = raw.replace(/\[TAGS\]/g, "\uD83C\uDFF7\uFE0F");  // never matches
  return display.replace(/\n/g, "  \n").replace(/</g, "\\<");
}
```

The `[TAGS]` → emoji replacement never fires. The direction generation strategy (`crucible-strategy.ts`) outputs free prose — no `[TAGS]` markers. The placeholder text (`"The story explores... [TAGS] tag1, tag2, tag3"`) is a red herring; it's a hint to the user, not the AI output format. The `\n` → markdown linebreak and `<` → `\<` conversions are the only lines doing real work.

**Fix:** Remove the dead `replace(/\[TAGS\]/g, ...)` line. Rename `formatForDisplay` → `escapeForMarkdown` to signal its actual purpose, and align with the identical `escapeViewText` helper in `ReviewView.ts`.

---

### 1.3 GoalCard Unmount-on-Every-Rebuild

**File:** `src/ui/components/Crucible/GoalsSection.ts:109-115`

```ts
const ensureGoalCard = (goalId: string): UIPart => {
  const existing = goalCardCache.get(goalId);
  if (existing) existing.unmount();   // <-- unconditionally unmounts then remounts
  const result = ctx.render(GoalCard, { goalId });
  goalCardCache.set(goalId, result);
  return result.part;
};
```

The comment says "Always rebuild GoalCards from scratch so getContent() reads current state at build time." But `getContent` is a lazy closure (`() => ctx.getState().crucible.goals.find(...)`) — it already reads live state. The unconditional unmount+remount on every `rebuildGoalsList()` call tears down and reconstructs all `useSelector` subscriptions on the **entire** goal list every time a single goal is added or removed. For small lists this is fine, but it's semantically wrong: the goal is stable identity, so only removed goals should be unmounted.

**Fix:** Unmount only on removal:
```ts
const ensureGoalCard = (goalId: string): UIPart => {
  const existing = goalCardCache.get(goalId);
  if (existing) return existing.part;  // reuse, don't remount
  const result = ctx.render(GoalCard, { goalId });
  goalCardCache.set(goalId, result);
  return result.part;
};
```
And in cleanup: only unmount IDs not in `currentIds`. This is already done in `rebuildGoalsList()` itself (lines 141-144), so the fix is just stopping `ensureGoalCard` from being destructive.

---

## 2. Dead Code & Cruft

### 2.1 `src/core/subscribable.ts` — Not Imported Anywhere ✓ DONE

This class (`Subscribable<T>`) exists but has zero imports across the entire `src/` tree. It predates the nai-store effects system and was never used in this codebase.

**Fix:** Delete the file.

---

### 2.2 `seededShuffle` and `stableOrderWithNewAtEnd` in `seeded-random.ts` ✓ DONE

**File:** `src/core/utils/seeded-random.ts:45-124`

`hashString`, `createSeededRandom`, `hashEntryPosition`, and `getStoryIdSeed` are all used (lorebook ordering). `seededShuffle` and `stableOrderWithNewAtEnd` are defined and documented but never imported anywhere in `src/`.

**Fix:** Delete lines 45–124 (the two unused exports). Keep the four used functions.

---

### 2.3 `MergedView.ts` — Deprecated Stub ✓ DONE

**File:** `src/ui/components/Crucible/MergedView.ts`

```ts
// Deprecated: merged phase collapsed into ReviewView (v8).
// File retained to avoid build tooling issues with cached imports.
export {};
```

If the build tooling no longer depends on this (test it), delete it. If it truly can't be deleted, the comment is sufficient. Either way, nothing should be _importing_ this file — grep confirms zero imports.

**Fix:** Delete the file. Verify `npm run build` still passes.

---

### 2.4 `any` Casts in GenerationButton Props

**Occurrences:** `GoalsSection.ts`, `IntentSection.ts`, `ShapeSection.ts`, `LorebookPanelContent.ts`

```ts
isDisabledFromProjection: (proj: any) => !proj.hasAccepted,
```

This bypasses strict type checking on projection results. The `any` is a workaround for the fact that `GenerationButton`'s `isDisabledFromProjection` prop signature uses a generic parameter that isn't inferred at the call site. The fix is a type-level change in `GenerationButton.ts` to make the projection and disabled callback share a properly inferred type, or to accept a typed projection interface. Four call sites use `any` — a sign the prop API isn't quite right.

---

## 3. Architecture & Separation of Concerns

### 3.1 StorageKey Naming Is Inconsistent

Three different conventions are used for `storyStorage` keys:

- Prefixed with `"story:"` → used with `storageKey` on UIPart inputs (NAI persists these automatically)
- Prefixed with `"cr-"` → used for Crucible-specific data (direction, goals, shape)
- Unprefixed → some miscellaneous keys

The `crucibleReset` effect correctly iterates all keys and removes those starting with `"cr-"`. But several keys used by the Crucible UI use `"story:"` prefixes (e.g., `"story:cr-direction-collapsed"`, `"story:cr-goals-collapsed"`). These won't be cleaned up by `crucibleReset`. This probably doesn't matter (they're UI state, not content), but it's inconsistent.

**Recommendation:** Document the convention in `ids.ts` or `CLAUDE.md`: `"story:"` prefix = UI state persisted by NAI's `storageKey` mechanism (not manually managed), `"cr-"` prefix = Crucible content managed by the reset effect.

---

### 3.2 `crucibleGoalsRequested` Reads StorageKey for Direction Sync

**File:** `src/core/store/effects/crucible-effects.ts:72-78`

```ts
const editedDirection = String(
  (await api.v1.storyStorage.get("cr-direction")) || "",
);
if (editedDirection) {
  dispatch(directionSet({ direction: editedDirection }));
}
```

When the user clicks "Generate Goals," the effect syncs the direction from storage to state. This is needed because `EditableText` persists edits to `storyStorage` but only dispatches `onSave` when the user explicitly saves. However, the same pattern is used implicitly for shape name (issue 1.1) and creates a hidden dependency: the effect _requires_ the storage to be up to date before dispatch. If the user edits direction and immediately clicks Generate Goals without blurring the input, the storage key may not be written yet.

**Recommendation:** Since `EditableText` already exposes `onChange`, consider whether direction edits should flow through state directly (via `crucibleDirectionEdited`) rather than through storage. This would eliminate the storage-sync step in the Goals effect.

---

### 3.3 Expansion Feature Is Working But Undiscoverable

The Expansion pipeline is complete end-to-end: `expansionTriggered` action → effect in `crucible-effects.ts:177` → `buildExpansionStrategy` → handler. The per-element "Expand" button in `ReviewView.ts:229-243` dispatches `expansionTriggered({ elementId })`, and the global "Expand World" section dispatches `expansionTriggered({})` (no element ID). Both work.

The issue is UX discoverability: the per-element Expand button is visually minimal (small label next to the field badge) and the global Expand section appears only when elements exist. Additionally, `buildExpansionStrategy` is not imported in `crucible-chain-strategy.ts`'s test coverage, and there's no visible indication when expansion is running because the per-element GenerationButton shares a single `requestId` lookup across all element expand buttons.

**Recommendation:** Each per-element expand button tracks the **same** `crucibleExpansion` request regardless of which element triggered it. This means all element expand buttons enter loading state simultaneously when any one fires. Consider adding per-element request tracking (`targetId: elementId`) so only the triggered element shows a spinner.

---

### 3.4 Effects File Naming

`src/core/store/effects.ts` (hub file that calls `registerXEffects`) and `src/core/store/effects/` (directory of individual effect modules) share the same name with different paths. This is confusing when navigating — a file named `effects.ts` sits one level above a folder named `effects/`. The hub file could be renamed `register-effects.ts` or moved into the effects directory as `effects/index.ts` (but `effects/index.ts` already exists and does something else).

**Recommendation:** Rename `src/core/store/effects.ts` → `src/core/store/register-effects.ts` to remove the naming collision. Low priority, but worth the one-line change in `src/index.ts` that imports it.

---

## 4. UI Patterns & Component Opportunities

### 4.1 `escapeForMarkdown` / `formatForDisplay` Is Duplicated

The same text-to-markdown-display transform appears in three places:

- `IntentSection.ts:14-16` as `formatForDisplay`
- `ReviewView.ts:38-40` as `escapeViewText`
- Inline in `GoalCard.ts` and several other components

All do: `raw.replace(/\n/g, "  \n").replace(/</g, "\\<")` plus optional fallback text.

**Fix:** Extract to `src/ui/utils.ts` (which already exists for UI utilities):

```ts
export function escapeForMarkdown(raw: string, fallback = ""): string {
  if (!raw.trim()) return fallback;
  return raw.replace(/\n/g, "  \n").replace(/</g, "\\<");
}
```

---

### 4.2 Show/Hide by Phase Is Repeated Verbatim

The visibility toggle pattern — `useSelector` on phase/state → `updateParts` with `{ display: "flex" }` / `{ display: "none" }` — appears in at least 8 components (`CruciblePanel`, `IntentSection`, `GoalsSection`, `ShapeSection`, `ProgressDisplay`, `ReviewView`, `LorebookPanelContent`, `BrainstormHeader`). Each one duplicates the same structure.

There's an existing `ui/utils.ts` that could house:

```ts
export function updateVisibility(updates: [id: string, visible: boolean][]): void {
  api.v1.ui.updateParts(
    updates.map(([id, visible]) => ({
      id,
      style: visible ? { display: "flex" } : { display: "none" },
    })),
  );
}
```

This is a small extraction but has high call frequency — worth doing.

---

### 4.3 `GenerationButton` Icon Variant Coupling

`GenerationButton.ts` handles two visually distinct variants: `"button"` (text label, full-width) and `"icon"` (compact, used in list items). These variants have diverged far enough that the shared implementation adds conditional branches throughout rather than clarity. `ListItem.ts`'s icon-button usage is the primary driver of the icon variant.

**Recommendation:** Not a critical refactor, but consider extracting `GenerationIconButton` as a thin wrapper that pre-configures the `variant: "icon"` defaults, reducing the conditional logic inside `GenerationButton` to a single branch point.

---

### 4.4 `GoalsSection`: "Generate Goals" Hidden When Goals Exist

When goals are populated, `GoalsSection` hides the "Generate Goals" button and shows only "+ Goal" and the trash can. But the user might want to regenerate all goals (e.g., after updating Direction). The only way to get a fresh batch is to clear goals first, then generate.

**Recommendation:** Keep the "Generate Goals" button accessible in the populated state, perhaps de-emphasized (secondary style) next to "+ Goal". Alternatively, make it a secondary action within the collapsible header row.

---

### 4.5 Expansion Per-Element Buttons Share One Request Slot

As noted in 3.3: each element card in ReviewView renders its own `GenerationButton` with `onGenerate: () => dispatch(expansionTriggered({ elementId: el.id }))`, but the `requestIdFromProjection` for all of them returns the same ID (the active or queued `crucibleExpansion` request). This means all element Expand buttons simultaneously enter "generating" state when any one fires.

The UX intent is probably that only the clicked element shows a spinner. This requires passing `elementId` into the `requestIdFromProjection` lookup and storing it in the queue entry's `targetId`, which is already set correctly in the effect (`targetId: elementId ?? "crucible"`). The fix is in the button's `requestIdFromProjection`:

```ts
requestIdFromProjection: () => {
  const s = ctx.getState();
  if (s.runtime.activeRequest?.type === "crucibleExpansion" &&
      s.runtime.activeRequest?.targetId === el.id) {
    return s.runtime.activeRequest.id;
  }
  return s.runtime.queue.find(
    (q) => q.type === "crucibleExpansion" && q.targetId === el.id
  )?.id;
},
```

---

## 5. State Management

### 5.1 Reducer Spread Pattern Is Verbose

Throughout the state slices, reducers use this pattern:

```ts
goalTextUpdated: (state, payload: { goalId: string; text: string; why?: string }) => {
  return {
    ...state,
    goals: state.goals.map((g) =>
      g.id === payload.goalId
        ? { ...g, text: payload.text, ...(payload.why !== undefined ? { why: payload.why } : {}) }
        : g,
    ),
  };
},
```

The conditional spread `...(payload.why !== undefined ? { why: payload.why } : {})` is a recurring idiom across multiple reducers and slices (`elementUpdated`, `prerequisiteUpdated`, `goalTextUpdated`). It's correct but noisy.

**Recommendation:** No change required — this is idiomatic immutable update code. But note that if nai-store ever adopts Immer-style draft mutations, these can all be simplified. Flag for future upgrade.

---

### 5.2 SEGA Relational Maps Are Ephemeral

`state.runtime.sega.relationalMaps` is cleared by `segaReset`. If SEGA is interrupted between the relational map stage and the keys stage, maps are lost and will be regenerated from scratch on resume. This is correct behavior (idempotent), but it adds latency on resume and the regenerated maps may differ from the first pass.

This is acceptable for v9 but worth revisiting if users report noticeably slow SEGA resumption.

---

## 6. Generation Pipeline

### 6.1 Direction Prompt Uses No Prefill

Unlike shape (prefill: `"SHAPE: "`) and goals (prefill: `"[GOAL] "`), direction generation has no assistant prefill. The model is free to open with any structure. This is intentional (direction is long-form prose), but it means the output sometimes opens with self-referential preamble ("Sure, here's the direction...") that the user sees in streaming.

**Recommendation:** Add a minimal prefill (`"The story "` or similar) to anchor the output format, similar to how the story engine's canon field is handled.

---

### 6.2 Lorebook Keys Parser: No Fallback on Missing `KEYS:` Line

**File:** `src/core/utils/lorebook-strategy.ts`

The keys parser requires an exact `KEYS:` line in the output. If the model fails to produce it (or uses `Key:`, `KEYS →`, etc.), the entry silently gets no keys. The only signal is a log line. The stub keys (`["kse-stub", ...]`) inserted by the content handler at least keep the entry active, but after the keys stage runs they're replaced with nothing.

**Recommendation:** Case-insensitive match (`/KEYS:/i`), and a last-resort fallback: if no KEYS line found, extract word tokens from `entry.displayName` as stub keys rather than leaving the entry keyless.

---

## 7. Testing

### 7.1 Reducer Coverage Is Zero

The state slices (`story.ts`, `brainstorm.ts`, `runtime.ts`, `ui.ts`, `crucible.ts`) have no unit tests. Reducers are pure functions and trivially testable.

**Highest priority:** `crucible.ts` reducer — `phaseTransitioned` (clears elements on `"building"`), `goalAcceptanceToggled`, `mergeCompleted`. These are central to the Crucible phase machine and subtle enough to break silently.

---

### 7.2 Handler Parsing Has No Tests

The tagged-text parsers in `handlers/crucible-chain.ts` (prerequisites, elements), `handlers/lorebook.ts` (keys, content), and `tag-parser.ts` are pure text → data transforms. They're the most fragile part of the pipeline (model output varies) and have zero test coverage.

**Recommended test cases:**
- `parseCrucibleGoal` — with `[GOAL]`/`[WHY]`, with missing WHY, with extra whitespace
- `parsePrerequisites` — multi-chunk accumulation, malformed tags
- `parseWorldElements` — multi-element, partial parse, missing CATEGORY
- `parseLorebookKeys` — happy path, missing KEYS:, extra text after keys

---

### 7.3 Strategy Factory Tests

The `buildStoryEnginePrefix` and `buildCruciblePrefix` context builders construct the message arrays that drive every generation. A test asserting message count, role ordering, and content inclusion would catch regressions in the cache ordering strategy (which has been rewritten multiple times).

---

## Summary Table

| # | Area | Severity | Fix Size | Status |
|---|------|----------|----------|--------|
| 1.1 | Shape name dual storage (bug) | Medium | Small | ✓ DONE |
| 1.2 | Dead regex in formatForDisplay | Low | Trivial | |
| 1.3 | GoalCard unconditional unmount | Low | Small | |
| 2.1 | `subscribable.ts` — delete | Low | Trivial | ✓ DONE |
| 2.2 | `seededShuffle` / `stableOrderWithNewAtEnd` — delete | Low | Trivial | ✓ DONE |
| 2.3 | `MergedView.ts` — delete | Low | Trivial | ✓ DONE |
| 2.4 | `any` casts in GenerationButton props | Low | Small |
| 3.1 | StorageKey naming — document convention | Low | Trivial |
| 3.2 | Direction sync via storage key | Medium | Small |
| 3.3 | Expansion UX discoverability | Medium | Small |
| 3.4 | `effects.ts` naming collision | Low | Trivial |
| 4.1 | `escapeForMarkdown` duplication | Low | Small |
| 4.2 | `updateVisibility` repeated pattern | Low | Small |
| 4.3 | GenerationButton icon variant coupling | Low | Medium |
| 4.4 | "Generate Goals" hidden when populated | Medium | Small |
| 4.5 | Expansion buttons share one request slot | Medium | Small |
| 5.1 | Verbose reducer spread (flag only) | None | — |
| 5.2 | Ephemeral relational maps (flag only) | None | — |
| 6.1 | Direction missing prefill | Low | Trivial |
| 6.2 | Lorebook keys parser no fallback | Medium | Small |
| 7.1 | No reducer unit tests | High | Medium |
| 7.2 | No handler parsing tests | High | Medium |
| 7.3 | No strategy factory tests | Medium | Medium |

---

## For BETA Readiness

The most important items before calling this BETA-ready:

1. **Fix 1.1** (shape name dual storage) — real bug waiting to surface
2. **Fix 4.4** (Generate Goals UX) — users will want to regenerate goals without clearing
3. **Fix 4.5** (expansion per-element spinner) — incorrect feedback during generation
4. **Address 7.1 + 7.2** (reducer and handler tests) — without these, Crucible phase machine and lorebook parsing can silently regress
5. **Delete 2.1–2.3** (dead files) — trivial cleanup that signals the codebase is maintained
