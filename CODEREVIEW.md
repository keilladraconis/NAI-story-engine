# Library Code Review

Architectural review of `lib/gen-x.ts`, `lib/nai-act.ts`, `lib/nai-store.ts` — grounded in Story Engine usage patterns.

---

## gen-x.ts — Generation eXchange

### `DONE` Collapse dual-state via constructor hooks
**Priority: High**

Added `GenXHooks` interface (`onStateChange`, `onTaskStarted`, `beforeGenerate`) as an optional constructor parameter. `onTaskStarted` fires when a task is picked off the queue, letting the store move requests from `queue` → `activeRequest` directly via the new `requestActivated` reducer — eliminating the 43-line reconciliation effect that polled `genX.getTaskStatus()`. `requestCompleted` now nulls `activeRequest` and fires unconditionally (including cancellation), since no reconciliation effect exists to clean up stale state. `subscribe()` / `state` getter / `listeners[]` remain for standalone use.

### `DONE` Add instrumentation hook
**Priority: Medium**

`beforeGenerate(taskId, messages)` fires after factory resolution, before the API call. Effects retain the factory-wrapping pattern for label-rich `[cache]` logging since `cacheLabel(target)` needs strategy context GenX doesn't have — but the hook is available for future middleware-style consumers.

### `TODO` Rename `cancelCurrent` → `cancelAll`
**Priority: Low**

`cancelCurrent()` clears the entire queue (`this.queue = []` at line 147) — the name implies it only cancels the running task. This is a naming/contract mismatch that will surprise consumers.

### `DEFER` Internalize CancellationSignal lifecycle
**Priority: Low**

`api.v1.createCancellationSignal()` is called at the dispatch site and threaded through. GenX could own signal creation internally and expose `cancel(taskId)` instead. Deferred because the current pattern works and callers are centralized in `effects.ts`.

### `DEFER` Harden `isTransientError`
**Priority: Low**

String matching on `"aborted"`, `"fetch"`, `"network"` etc. is fragile — any error message containing these substrings gets retried, and legitimate errors will be silently retried 5 times. Deferred because the NovelAI error surface is small and well-known in practice.

---

## nai-act.ts — Component Framework

### `DONE` Unify describe/mount into single lifecycle
**Priority: High**

Added `ctx.render(Component, props)` to `BindContext` — calls `describe()` + `mount()` in one shot, returning `{ part: UIPart; unmount: () => void }`. Props are specified once in `onMount()`, and the returned `part` is injected into a placeholder container via `updateParts`. Migrated consumers: `TextField.ts`, `ListField.ts`, `LorebookPanelContent.ts`, `List.ts`, `Header.ts`, `Input.ts`. Not migrated: `FieldList.ts` (children depend on initial `useSelector` for visual state), `ListItem.ts` (needs different props in describe vs mount).

### `DONE` Give `describe()` access to state
**Priority: High**

Resolved by `ctx.render()`. Components that needed state-dependent callbacks (e.g. `LorebookPanelContent`'s `onGenerate`) now specify them in `onMount()` where `ctx.getState()` and `ctx.dispatch()` are available. The `store` singleton import was removed from `LorebookPanelContent` — no UI components import the store directly.

### `TODO` Make `createEvents` per-instance
**Priority: Medium**

`createEvents` returns a module-level singleton Proxy. All instances of a component share one event bus. `ButtonWithConfirmation` works around this with a `buttonRegistry` keyed by ID — a pattern needed by *every* reusable multi-instance component. Fix: `createEvents` should return a factory, or events should be scoped per-component-instance in `onMount`.

### `TODO` Add `ctx.mountList()` helper
**Priority: Medium**

The `List` component (brainstorm messages) manually tracks cleanup functions and remounts all children on every update — O(n) unmount+remount when a single message is added. A `ctx.mountList(items, keyFn, Component)` helper that diffs keys and only mounts/unmounts deltas would eliminate this.

### `TODO` Make `onMount` optional
**Priority: Low**

`SettingField` declares an empty `onMount(_props: {}, _ctx: BindContext<RootState>) {}`. Making `onMount` optional in the `Component` interface (with a default no-op in `mount()`) would clean this up.

### `DONE` Fix `describe()` return type friction
**Priority: Low**

Resolved by `ctx.render()`. Child components are no longer called directly in `describe()` parent layout arrays, so the `as UIPart` casts are eliminated. `ctx.render()` returns `{ part: UIPart }` with the correct type, injected via `updateParts`.

---

## nai-store.ts — State Management

### `DONE` Add `actionCreator.type` static property
**Priority: High**

Seven+ locations fall back to manual `action.type === someCreator({ id: "" }).type` comparisons with dummy payloads and `as FieldAction` casts. Exposing the type string as a static property (`uiFieldEditBegin.type`) would make these clean and refactor-safe.

### `DONE` Add payload predicate to `matchesAction`
**Priority: High**

`matchesAction` can't filter on payload fields. Components like `TextField` need to match actions for a *specific* field ID, requiring inline predicates with type casts:
```typescript
action.type === uiFieldEditBegin({ id: "" }).type &&
  (action as FieldAction).payload.id === config.id
```
A `matchesAction(creator, payloadPredicate?)` overload would eliminate this.

### `TODO` Add `matchesSlice(name)` predicate
**Priority: Medium**

The autosave effect (`effects.ts:648`) uses `action.type.startsWith("story/")` to catch all actions in a slice. This should be a first-class utility rather than a string operation.

### `DONE` Replace hardcoded action type strings
**Priority: Medium**

Three places in `effects.ts` use raw strings: `"story/dulfsItemAdded"` (line 676), `"story/loadRequested"` (line 650). These are refactoring time-bombs when the exported action creators exist and should be used instead. Blocked on: `actionCreator.type` static property (see above).

### `TODO` Add debounce primitive
**Priority: Medium**

The autosave effect has a comment: `// Debouncing? NAIStore doesn't debounce.` For a store that fires effects synchronously on every dispatch, a `debounceEffect(predicate, handler, ms)` or `subscribeEffect.debounced()` would be a natural extension. Note: requires `api.v1.timers` instead of `setTimeout`.

### `TODO` Remove `createReducer` (dead export)
**Priority: Low**

Exported but never imported anywhere in the codebase. All slices use `createSlice`. Removing it reduces API surface confusion.

### `DEFER` Signal actions without reducers
**Priority: Low**

`ui.ts` defines `generationSubmitted: (state, _strategy: any) => state` — a "signal action" that doesn't modify state but exists to trigger effects. The `any` cast reveals that `createSlice`'s type inference breaks down for complex payload types. A `createSignal<P>(name)` helper could produce an action creator + matcher without requiring a reducer entry. Deferred because the workaround is contained.

### `DEFER` Effect cleanup / teardown
**Priority: Low**

`subscribeEffect` returns unsubscribe functions, but `registerEffects()` discards every return value. Effects are immortal. Fine for a single-lifecycle app, but makes testing harder and prevents hot-reload. Deferred because Story Engine has no hot-reload requirement.

---

## Cross-Cutting: Testability

### `TODO` GenX: Inject budget listener dependency
**Priority: Medium**

GenX constructor now accepts `GenXHooks` for lifecycle events, but `initBudgetListener()` still calls `api.v1.hooks.register` directly — GenX can't be instantiated in tests without mocking `api.v1.hooks` globally. Injecting the budget listener (or its registration function) via constructor options would complete testability.

### `TODO` nai-act: Export a `createTestContext()` helper
**Priority: Medium**

Testing `onMount` requires manually constructing a partial `BindContext` with `as any` casts (`GenerationButton.test.ts:28`). A test helper that produces a properly-typed mock context would improve test ergonomics.

### `DEFER` nai-store: Return teardown from `registerEffects()`
**Priority: Low**

Effects can't be torn down between tests. Deferred — current test isolation via mocks is sufficient.
