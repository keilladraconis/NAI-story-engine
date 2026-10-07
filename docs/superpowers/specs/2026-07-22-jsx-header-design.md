# JSX Header — Bootstrap + GenX Status

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX Story Engine tab has no header bar. Two panel-level features live only in
the SUI `SeHeaderBar`: the **Bootstrap** button (Opening/Continue Scene) and the
**GenX status** surface (SEGA status text, a Continue button when generation waits
on user presence, and a budget-wait countdown). This slice brings both into the
JSX panel. The **Import** wizard (the SUI header's third feature) is deferred to
its own slice.

This is **pure JSX presentation** — every action and all state already exist:

- `bootstrapRequested()` / `bootstrapContinueRequested()` (runtime slice).
- `uiUserPresenceConfirmed()`, `uiRequestCancellation()`, `uiCancelRequest({ requestId })` (ui slice).
- `runtime.genx.status` (`"idle" | "waiting_for_user" | "waiting_for_budget" | …`),
  `runtime.genx.budgetWaitEndTime`, `runtime.sega.statusText`,
  `runtime.activeRequest` / `runtime.queue`, `runtime.historyEpoch`.
- The `onHistoryNavigated` hook already bumps `historyEpoch` (bootstrap-effects.ts),
  so undo/redo reactivity needs no new wiring — the button just reads it.

In JSX this collapses the SUI's imperative `updateParts`/marquee/timer machinery
into a few reactive components driven by `useSlice`.

## Goals

- A header row at the top of the Story Engine tab with the Bootstrap button and
  the GenX status surface.
- Bootstrap button: correct label derived live from document content, undo-reactive
  (`historyEpoch`), with queued/active states.
- GenX status: Continue (presence-wait), budget-wait countdown, SEGA status text.

## Non-Goals

- The Import wizard (its own slice).
- The scrolling marquee animation (replaced by static truncated status text).
- Any backend/state/prompt change.

## Deliberate simplifications from SUI

- **No marquee**: `sega.statusText` renders statically, truncated with ellipsis
  (`overflow: hidden; white-space: nowrap; text-overflow: ellipsis`). The SUI
  marquee was imperative-timer eye-candy; truncation is adequate and far simpler.
- **Waiting states live in the center `GenxStatus`, decoupled from the bootstrap
  button.** SUI merges Continue/Wait onto the bootstrap button (to avoid mobile
  wrap) and suppresses the center. JSX keeps Continue/Wait in one place for _any_
  active generation; during a bootstrap wait, the bootstrap button is simply
  dimmed/active and the center shows Continue/Wait. Functionally equivalent, no
  duplicated waiting logic.

## Reference behavior (SUI `SeHeaderBar`, verified)

- `stageLabel(type)`: `"⚡ Continue Scene"` if `type === "bootstrapContinue"`, else
  `"⚡ Opening Scene"`.
- Idle stage derived from `(await api.v1.document.sectionIds()).length > 0`:
  non-empty → Continue Scene, empty → Opening Scene. Re-derived on `historyEpoch`
  change and after a bootstrap request settles.
- Bootstrap request types: `"bootstrap"` / `"bootstrapContinue"`.
- Queued bootstrap: label dimmed, click → `uiCancelRequest({ requestId: queuedId })`.
- Active + `genx.status === "waiting_for_user"`: Continue → `uiUserPresenceConfirmed()`.
- Active + `genx.status === "waiting_for_budget"`: `Wait (Ns)` countdown from
  `budgetWaitEndTime`, click → `uiRequestCancellation()`.
- Center status: Continue when `waiting_for_user`, Wait countdown when
  `waiting_for_budget`, else the (marquee) `sega.statusText`.

## Components — `src/ui-jsx/panels/header/`

### `useCountdown(endTime: number | null): number` — hook

Returns whole seconds remaining until `endTime` (a `Date.now()`-based epoch ms),
re-rendering every second while active; `0` when `endTime` is null or elapsed.
Uses `api.v1.timers.setTimeout` recursively (no `setInterval` in QuickJS), cleaned
up on unmount / when `endTime` changes — mirror `ConfirmButton`'s timer/ref
discipline. Backed by a pure exported helper:

```ts
export function remainingSeconds(endTime: number | null, now: number): number {
  if (endTime == null) return 0;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}
```

`Date.now()` is available in the UI runtime (SUI `SeHeaderBar` uses it).

### `BootstrapButton.tsx`

Reactive to a small slice of runtime + local document-content state:

- `historyEpoch = useSlice((s) => s.runtime.historyEpoch)`.
- Bootstrap request state via **separate `useSlice` calls, each returning a
  primitive** (a single object-returning selector would fail the Object.is
  comparison and loop):
  ```ts
  const queuedId = useSlice(
    (s) =>
      s.runtime.queue.find(
        (r) => r.type === "bootstrap" || r.type === "bootstrapContinue",
      )?.id ?? "",
  );
  const pendingType = useSlice((s) => {
    const q = s.runtime.queue.find(
      (r) => r.type === "bootstrap" || r.type === "bootstrapContinue",
    );
    const a = s.runtime.activeRequest;
    return (
      q?.type ??
      (a?.type === "bootstrap" || a?.type === "bootstrapContinue" ? a.type : "")
    );
  });
  const active = useSlice((s) => {
    const t = s.runtime.activeRequest?.type;
    return t === "bootstrap" || t === "bootstrapContinue";
  });
  ```
- `const [hasContent, setHasContent] = useState(false)`; a `useEffect` re-fetches
  `(await api.v1.document.sectionIds()).length > 0` on mount, whenever
  `historyEpoch` changes, and whenever `active` transitions true→false (a settle).
  Guard against a stale async resolution with a cancelled flag (like other JSX
  async effects).
- Render:
  - `queuedId` → dimmed `stageLabel` (from the queued type), click →
    `uiCancelRequest({ requestId: queuedId })`.
  - `active` → dimmed, non-interactive label (`stageLabel` of the active type).
  - idle → `hasContent ? "⚡ Continue Scene" : "⚡ Opening Scene"`, click →
    `bootstrapContinueRequested()` / `bootstrapRequested()`.

### `GenxStatus.tsx`

The single home for live generation feedback (any active gen):

- `status = useSlice((s) => s.runtime.genx.status)`.
- `budgetEnd = useSlice((s) => s.runtime.genx.budgetWaitEndTime ?? null)`.
- `statusText = useSlice((s) => s.runtime.sega.statusText)`.
- Render:
  - `waiting_for_user` → a **Continue** button (accent style) →
    `uiUserPresenceConfirmed()`.
  - `waiting_for_budget` → `Wait (${useCountdown(budgetEnd)}s)` text, click →
    `uiRequestCancellation()`.
  - else → the truncated `statusText` (empty string renders nothing visible).

### `Header.tsx`

A flex row: `[GenxStatus grows/left] … [BootstrapButton right]`.
`{ display: "flex", alignItems: "center", gap, padding }`, GenxStatus in a
`flex: 1; minWidth: 0; overflow: hidden` column, BootstrapButton content-sized.

### `StoryEngine.tsx`

Render `<Header />` at the top of the Foundation+World stack (above `<Foundation />`).
It shows only on the main view, not the entity/thread edit panes (those return
early before the stack) — matching current behavior.

## Tasks

1. `useCountdown` hook + pure `remainingSeconds` helper (unit-tested).
2. `BootstrapButton` — idle/queued/active states + document-content reactivity.
3. `GenxStatus` + `Header` shell + `StoryEngine` placement.

## Testing

- `tests/ui-jsx/countdown.test.ts` (new): `remainingSeconds` — null → 0; elapsed
  (now ≥ endTime) → 0; `ceil` rounding (e.g. 2500ms remaining → 3); exact boundary.
- Tasks 2–3: tsc-gated + whole-slice live-verify.
- Live-verify (on the **Story Engine (JSX)** tab — confirm icon-only S.E.G.A.):
  - Empty document → button reads **⚡ Opening Scene**; click → writes the cold
    open; button flips to **⚡ Continue Scene**; click extends one paragraph.
  - Undo the opening → button flips back to **⚡ Opening Scene** (historyEpoch).
  - Trigger a generation that waits on presence → **Continue** appears; click resumes.
  - Budget wait → **Wait (Ns)** counts down; SEGA run shows its status text.

## Risks / Notes

- **`useSlice` returns primitives** (numbers/strings/booleans) — no fresh-object
  loops. The document-content check is local `useState`, not a selector.
- **Countdown cleanup**: clear the pending timer on unmount and when `endTime`
  changes, or a detached tick leaks (mirror `ConfirmButton`).
- **Stale async guard**: the document `sectionIds()` fetch is async; a cancelled
  flag prevents a late resolution from clobbering a newer state.
- **Bootstrap document writes** are unchanged (handled by the existing bootstrap
  handler/effects); this slice only triggers the actions and reflects state.
- Header renders only on the main Story Engine view; the edit panes already
  early-return before the Foundation+World stack.
