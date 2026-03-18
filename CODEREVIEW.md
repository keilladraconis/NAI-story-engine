# Code Review — NAI Story Engine (v0.10.2)

Review date: 2026-03-16. Focus: code smells, antipatterns, refactoring opportunities, simplification.

---

## 1. Type Safety

### `any` casts

| Location | Issue | Status |
|---|---|---|
| `src/index.ts:113` | `const panels: any[]` — should be typed as `UIExtension[]` | **FIXED** |
| `src/ui/components/GenerationButton.ts:152` | `let timerId: any` — timer ID from `api.v1.timers` | **FIXED** |
| `src/ui/components/BudgetFeedback.ts:41` | `let timerId: any` — same pattern | **FIXED** |

### Loose equality

| Location | Issue | Status |
|---|---|---|
| `src/core/store/effects/brainstorm-effects.ts:119` | `== "user"` instead of `===` | **FIXED** |

---

## 2. Global Mutable State

These modules use module-level `let` bindings that act as hidden singletons:

| Location | Variable | Risk |
|---|---|---|
| `src/ui/framework/editable-draft.ts:8` | `let pendingSave` | Shared mutable closure — if two editors race, one save is silently dropped |
| `src/core/generation-journal.ts:14` | `let journal: JournalEntry[]` | Unbounded growth — never trimmed during a session |

**Fix:** Move into store state or pass via dependency injection from `index.ts`. The journal especially should either cap its length or be stored in a slice so it's observable.

---

## 3. Duplicate Code

### `stripThinkingTags`

Identical implementation was in two files. **FIXED** — extracted to `src/core/utils/tag-parser.ts`, both handlers now import from there.

---

## 4. Dead Code

| Location | What | Status |
|---|---|---|
| `src/core/utils/seeded-random.ts` | `seededShuffle()` and `stableOrderWithNewAtEnd()` | Already deleted in a prior change |

---

## 5. Magic Strings & Numbers

### Storage keys

**FIXED** — Added `STORAGE_KEYS` registry to `src/ui/framework/ids.ts` with all literal and dynamic key builders. Updated 18 files to import and use `STORAGE_KEYS` instead of bare strings. Regex patterns in bulk cleanup (`lorebook-sync.ts` `storyCleared` handler) left as-is since they match key prefixes.

### Magic number

| Location | Issue | Status |
|---|---|---|
| `src/core/store/effects/lorebook-sync.ts:119` | `.slice(5)` to skip `"----\n"` — meaning is opaque | **FIXED** — uses `ERATO_SEPARATOR.length` |

---

## 6. Performance

### O(n²) in reducer

`src/core/store/slices/crucible.ts:122-127` — `elementDeleted` reducer iterates all remaining elements to update `order` fields after a delete.

**Fix:** Use a sparse ordering scheme (e.g., fractional indices or a simple array where position *is* order) so deletes are O(1).

### Repeated API calls in loops

`src/core/store/effects/sega.ts` makes 7 separate `api.v1.lorebook.entry()` calls inside loops to look up lorebook entries.

**Fix:** Batch-fetch entries once at the start of the effect (or cache the result of `api.v1.lorebook.entries()`) and index by ID. This reduces IPC round-trips.

---

## 7. Incomplete nai-act v0.2.0 Migration

| Component | File | Status |
|---|---|---|
| `TensionsSection` | `src/ui/components/Crucible/TensionsSection.ts` | **FIXED** — converted to `bindList` |
| `BuildPassView` | `src/ui/components/Crucible/BuildPassView.ts` | Not converted — elements are grouped by field into collapsible sections, making this a non-trivial refactor. Would require extracting element/link cards into standalone components first. |

---

## 8. Architectural Smells

### Editable draft singleton

`editable-draft.ts` implements a "singleton active editor" pattern with `registerActiveEditor` / `flushActiveEditor` / `clearActiveEditor`. The singleton behavior is intentional — opening a second editor should flush-save the first. The risk is a component forgetting to call `clearActiveEditor`, leaving the module in a stale state.

**Fix:** Add a defensive check: if `registerActiveEditor` is called while a previous callback is still registered, auto-flush the previous one before registering the new callback (i.e., make the "flush before open" invariant impossible to violate from the call site).

### GenerationButton complexity

`GenerationButton` (~200 lines) manages a timer-based state machine for budget wait, cancellation, spinner animation, and disabled state — all inside a single `useSelector` callback. This makes it hard to test or modify individual behaviors.

**Fix:** Split into composable concerns: extract the budget-wait timer into `BudgetFeedback` (which already exists but is separate), and let `GenerationButton` focus on generate/cancel/disabled state.

---

## 9. Test Coverage

The test suite covers ~23% of the codebase. Key gaps:

| Area | Status |
|---|---|
| All UI components | Untested |
| Generation handlers (`handlers/*.ts`) | Untested |
| SEGA orchestration (`sega.ts`) | Untested |
| Lorebook sync (`lorebook-sync.ts`) | Untested |
| Context builder | Tested |
| Store slices | Partially tested |
| Utility functions | Partially tested |

The test setup (`tests/setup.ts`) mocks the `api` global but is missing mocks for several API surfaces used in production code (e.g., `api.v1.lorebook`, `api.v1.timers`).

**Fix:** Prioritize testing generation handlers and SEGA orchestration — these are the most complex and bug-prone code paths. Add missing API mocks to the shared setup.

---

## 10. Quick Wins (Low Effort, High Value)

1. ~~**Delete dead code** in `seeded-random.ts`~~ — already removed
2. ~~**Extract `stripThinkingTags`** to `tag-parser.ts`~~ — **DONE**
3. ~~**Fix `==` to `===`** in brainstorm-effects~~ — **DONE**
4. ~~**Type timer IDs** as `number | null`~~ — **DONE**
5. ~~**Named constant for `"----\n"`** separator~~ — **DONE**
6. ~~**Convert TensionsSection to `bindList`**~~ — **DONE**; BuildPassView deferred (needs component extraction first)
7. ~~**Type `panels` as `UIExtension[]`** in index.ts~~ — **DONE**
