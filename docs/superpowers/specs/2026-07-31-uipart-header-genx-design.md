# UIPart header + centralised GenX state machine

**Date:** 2026-07-31
**Branch:** v14
**Status:** design, awaiting approval

## Problem

The NovelAI script harness meters `api.v1.generate()` against input and output token
buckets. Those buckets only replenish while the harness believes the user is present.
Two flags gate replenishment: a real-time flag (FlagA, ~240s) and a user-interaction
flag (FlagB).

**A click on a `part.button()` clears FlagB. A click on a `<button>` inside a
`part.jsx()` does not.**

Since the SUI teardown, every Story Engine control is JSX. The consequence is that
Story Engine can no longer clear FlagB at all. Once the 240s window lapses mid-session,
generation stalls and the panel offers the user no way to resume — including the
`⚠️ Continue` affordance in `GenxStatus`, whose entire purpose is to clear FlagB. The
button exists, is clicked, and does nothing.

A large amount of the Story Engine UX is built on intelligent budget handling and on the
user's ability to poke the harness and resume. That capability is currently absent.

## Goals

- Restore the ability to clear FlagB from within Story Engine.
- Give the generation state machine exactly one home, always visible.
- Surface remaining output budget so a stall is legible before it happens.

## Non-goals

- Bypassing or extending the budget itself. The wait is runaway protection and should
  stay. Only legibility and recoverability are in scope.
- Reintroducing SUI or a general reactive-UIPart framework.
- Changing per-target pending indication on foundation, entity, thread, or forge
  buttons. They are already correct.

## Decisions taken

| Question                          | Decision                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| Verify FlagB premise first?       | No — treated as settled from prior SUI-era observation.          |
| What lifts to UIParts?            | The full header: status widget, import button, bootstrap button. |
| Where does SEGA status text go?   | Its own full-width text part on a second row.                    |
| What do other buttons disable on? | Their own target only. Queueing stays possible.                  |
| Budget readout liveness?          | Adaptive timer: 1s while waiting for budget, 5s otherwise.       |
| Root part type?                   | `container`, not `column` — see Architecture.                    |

## Architecture

### Layout

```
┌─────────────────────────────────────┐
│ [1.2k out]        [⭳]  [⚡ Opening] │  ← UIParts (row 1)
│ Characters 3/7 — lorebook content   │  ← UIPart text (row 2, collapses when empty)
├─────────────────────────────────────┤
│    Chat    │    Story Engine        │  ← JSX
├─────────────────────────────────────┤
│         (panel body)                │
└─────────────────────────────────────┘
```

The header sits above the JSX panel and is therefore visible in every UI state,
including the Chat tab, the entity/thread edit panes, and the import wizard — all of
which currently hide it. This is deliberate: a stalled generation must always be
pokeable.

### Parts tree

```
container#kse-root          grid, gridTemplateRows "auto minmax(0, 1fr)", height 100%, minHeight 0
├── container#kse-header    flex column, gap SP.sm, borderBottom, flexShrink 0, padding SP.sm
│   ├── row#kse-header-row1       alignment "center", spacing "space-between", gap SP.sm
│   │   ├── button#kse-widget
│   │   ├── button#kse-import          iconId "download"
│   │   └── button#kse-bootstrap       disabledWhileCallbackRunning: true
│   └── text#kse-header-status         fontSize .8em, opacity .8, nowrap + ellipsis
└── jsx#kse-jsx-root        unchanged; keeps its own display:grid / minmax(0,1fr) / height:100%
```

The root is a `container` rather than a `column`. `column` renders as a flex box with
its own spacing and alignment defaults; the root needs to impose a two-row grid height
contract without fighting them. `container` is documented as a plain div with no styling
of its own, so our `style` is the only styling in play. `row` and `column` are still used
_inside_ the header, where their flex defaults are what we want.

### Files

New directory `src/ui/header/`, replacing `src/ui/panels/header/`:

| File               | Role                                                             | Tested        |
| ------------------ | ---------------------------------------------------------------- | ------------- |
| `header-model.ts`  | `derive(state, inputs) → HeaderModel`                            | yes, pure     |
| `header-parts.ts`  | `build(model) → UIPart`, `patch(prev, next) → Partial<UIPart>[]` | yes, pure     |
| `header-driver.ts` | store subscription + adaptive timer + `updateParts`              | no, I/O shell |
| `countdown.ts`     | `remainingSeconds`, `waitLabel` (moved; `useCountdown` deleted)  | yes, existing |

This is the same split `countdown.ts` already uses, where `remainingSeconds` is unit
tested and the I/O shell around it is not.

### The model

```ts
type WidgetMode = "budget" | "cancel" | "continue" | "wait";

type HeaderModel = {
  widget: { mode: WidgetMode; text: string };
  statusText: string; // "" ⇒ row 2 collapses to display:none
  bootstrap: { text: string; disabled: boolean };
  importDisabled: boolean;
};

type DeriveInputs = {
  allowedOutput: number; // api.v1.script.getAllowedOutput()
  hasDocumentContent: boolean; // cached; see Data flow
  now: number; // Date.now()
};

function derive(state: RootState, inputs: DeriveInputs): HeaderModel;

/** Cheap change-detection key for the store subscription. See Data flow. */
function storeSignature(state: RootState): string;
```

`storeSignature` lives in `header-model.ts` alongside `derive` so it is pure and testable —
it is the one piece of the driver whose incompleteness would cause silent staleness rather
than a visible failure.

Widget mode, from `state.runtime.genx.status`:

| status                        | mode       | text                                                  |
| ----------------------------- | ---------- | ----------------------------------------------------- |
| `waiting_for_user`            | `continue` | `⚠️ Continue`                                         |
| `waiting_for_budget`          | `wait`     | `waitLabel(remainingSeconds(budgetWaitEndTime, now))` |
| `queued`, `generating`        | `cancel`   | `🚫 Cancel`                                           |
| `idle`, `completed`, `failed` | `budget`   | `formatOutputBudget(allowedOutput)`                   |

`formatOutputBudget(n)` returns `"412 out"` below 1000 and `"1.2k out"` at or above it
(one decimal place). No leading bolt — the bolt is reserved for action buttons, so the
status widget reads as a readout rather than a third action.

Widget style per mode mirrors the components being replaced: `budget` is subtle
(transparent, `opacity: .8`), `cancel` uses `T.warning`, `continue` uses `T.textHeadings`
on `T.bg` and bold, `wait` uses `T.bg2`.

`bootstrap.text` is `⚡ Continue Scene` when `hasDocumentContent`, else `⚡ Opening Scene`.
`bootstrap.disabled` is true while a `bootstrap` or `bootstrapContinue` request is queued
or active. `importDisabled` is `state.ui.importWizardOpen`.

Styling imports `T` and `SP` from `src/ui/style.ts` unchanged. `T` is entirely
`var(--theme-*)` references, so the UIPart header and the JSX body share one palette and
follow the user's theme identically.

### Callbacks

Each button is registered with **one static callback, never re-registered**. `updateParts`
only ever carries `text`, `disabled`, and — when it changes — the complete `style` object
(CLAUDE.md: `updateParts` replaces style wholesale, so a partial style object would drop
properties).

Each callback reads `store.getState()` at click time and switches on the current mode.
The widget's four behaviours are four branches inside one handler, not four part specs —
the DRY-in-UI rule, with the difference pushed into the leaf.

| Mode       | Widget click                            |
| ---------- | --------------------------------------- |
| `budget`   | no-op (the click itself is the feature) |
| `cancel`   | `uiRequestCancellation()`               |
| `continue` | `uiUserPresenceConfirmed()`             |
| `wait`     | `uiRequestCancellation()`               |

`uiRequestCancellation` already calls `genX.cancelAll()` and dispatches `requestCancelled`
for the active request, so a single dispatch gives correct global-cancel semantics. The
two-dispatch dance in today's `SendButton.cancelActive` is not needed here.

## Invariants

1. **The header widget is never `disabled`.** A disabled button fires no click and would
   therefore clear no FlagB — disabling it would break the one lever this change exists to
   build. In `budget` mode the callback is a deliberate no-op.
2. **`derive()` is the only place `genx.status` is branched on.** Every other surface keys
   off per-target request ids. Enforced by test, see Testing.

## Data flow

`start()` in `mount.ts` builds the parts with `derive()` already applied, calls
`api.v1.ui.register()`, and only then starts the driver. The first paint is therefore
correct with zero `updateParts` calls, which sidesteps the documented "update will not go
through if the part has not yet been mounted by react" race. This mirrors the retired SUI
rule that `compose()` must populate initial display values synchronously.

The driver has two wake sources feeding one `tick()`:

```
store.subscribe ──┐
                  ├─→ tick(): read state + getAllowedOutput() + Date.now()
adaptive timer ───┘         → derive() → model
                            → if model ≠ lastModel: updateParts(patch(lastModel, model))
                            → reschedule: 1000ms in `wait` mode, else 5000ms
```

The subscription first computes a cheap **store signature** and returns without work
unless it changed:

```
genx.status | genx.budgetWaitEndTime | sega.statusText
            | queue.map(r => `${r.type}:${r.id}`).join(",")
            | activeRequest?.id | ui.importWizardOpen | runtime.historyEpoch
```

The queue contributes its full type/id composition, not its length. A length alone would
miss a same-size queue whose contents changed — cancelling a queued `bootstrap` while a
`foundation` request is enqueued leaves `queue.length` at 1 while `bootstrap.disabled`
must flip to false.

Ordinary store churn therefore costs one string compare. The timer exists only for the two
things no dispatch announces: the ticking countdown, and the bucket silently refilling.

The timer is a single self-rescheduling chain. Subscription-triggered ticks compute and
push but **do not** reschedule, so a burst of dispatches cannot stack parallel timer
chains; only a timer-triggered tick arms the next one.

`hasDocumentContent` stays asynchronous and cached. The driver re-reads
`api.v1.document.sectionIds()` when `historyEpoch` changes or when a bootstrap request
settles — the same dependencies as today's `useEffect` in `BootstrapButton` — and passes
the cached boolean _into_ `derive`, keeping `derive` pure and synchronous.

Full round trip: click → dispatch → effect → GenX → `onStateChange` → store → signature
change → tick → `updateParts`. One hop longer than the JSX path, same shape.

## Changes

**New:** `src/ui/header/header-model.ts`, `header-parts.ts`, `header-driver.ts`

**Moved:** `src/ui/panels/header/countdown.ts` → `src/ui/header/countdown.ts`, dropping
`useCountdown` (both callers are removed by this change; `remainingSeconds` and
`waitLabel` are now consumed by `derive`)

**Deleted:** `src/ui/panels/header/GenxStatus.tsx`, `Header.tsx`, `BootstrapButton.tsx`
(the `panels/header/` directory goes away entirely)

**Edited:**

- `src/ui/mount.ts` — root `container` wrapping the header parts and the jsx part; driver
  started after `register()`
- `src/ui/panels/StoryEngine.tsx` — drop `<Header>` and the `onOpenImport` prop plumbing
- `src/ui/panels/chat/SendButton.tsx` — roughly 130 lines to 35. Keeps `isChatBusyType`
  and `busyRequestId` as the disable predicate; loses `computeMode`, all four non-idle
  branches, `useCountdown`, and the `uiCancelRequest` / `uiRequestCancellation` /
  `uiUserPresenceConfirmed` imports. Two states: enabled `⚡ {label}`, or disabled while a
  chat-family request is queued or active.

**Untouched:** `FieldCard`, `EntityCard`, `ThreadEditPane`, `EntityEditPane`, and the
forge controls. All four already reduce to a single per-target `pending` boolean and only
disable — they have no send/cancel/continue/wait machinery to drop. The state machine
exists in exactly three components, all of which are deleted or simplified above.

## Error handling

- `api.v1.script.getAllowedOutput()` is declared in `external/script-types.d.ts`, so it is
  called directly with no defensive existence check (CLAUDE.md: trust the `.d.ts`).
- Timer teardown carries over `countdown.ts`'s existing discipline: the `.then(id)` guard
  that clears a timer whose creation promise resolved after cancellation.
- A dropped or ignored `updateParts` is self-healing. The driver diffs against its own last
  _model_, not against rendered output, so the next tick recomputes and pushes again.
- `disabledWhileCallbackRunning` on the bootstrap button guards against the known
  double-`click`-per-tap behaviour on mobile for the one non-idempotent header action.
  Continue and Cancel are idempotent and need no guard.

## Testing

**`tests/ui/header-model.test.ts`** — the bulk of the coverage. Table-driven across all
four widget modes, `formatOutputBudget` boundaries (999/1000), empty and non-empty status
text, both bootstrap labels, bootstrap disabled while queued and while active, and
`importDisabled`. This is where the state machine is pinned down.

It also covers `storeSignature`: the signature must change for every field `derive` reads
from the store. The load-bearing case is a same-length queue with different contents, which
a naive `queue.length` signature would miss.

**`tests/ui/header-parts.test.ts`** — ids are stable across builds; `patch()` of an
unchanged model returns an empty array; a style change carries the complete style object
rather than a delta; every part in `build()` output carries an id.

**`tests/ui/countdown.test.ts`** — the existing guard is **inverted**. Today it asserts
that every `.tsx` branching on `waiting_for_budget` uses `useCountdown`. It becomes: no
`.tsx` under `src/ui/` may mention `waiting_for_budget` at all, and `header-model.ts`
must. That inversion mechanically enforces invariant 2 and prevents the state machine
leaking back into JSX in a later change.

**Live verification, not coverable by vitest:**

1. **Height contract.** The `container` root with `gridTemplateRows: "auto minmax(0, 1fr)"`
   must hand its bottom row to the jsx part so the chat list still scrolls internally and
   the composer stays pinned to the bottom. This is implementation step one and is verified
   in the browser before any button work.
2. **FlagB.** Burn the output bucket, idle past 240s, confirm the header widget's click
   resumes replenishment where a JSX click does not. `dist/jsx-click-budget-flag.tsx` is
   the standalone probe for this.

## Risks

**The height contract is the likeliest thing to break, and it breaks visibly.** `mount.ts`
currently leans on a `display:grid / gridTemplateRows:minmax(0,1fr) / height:100%` wrapper
on the jsx part so chat scrolls internally. Introducing a parent means that contract has to
survive one more level. Mitigated by making it step one, verified live, before anything
else is built on top of it.

**`updateParts` returns to `src/`.** It was reduced to zero by the SUI teardown. This is a
deliberate, bounded reintroduction: exactly one file (`header-driver.ts`) may call it, and
it holds no logic beyond "did the model change, push what differs." Worth a note in
CLAUDE.md when the work lands, so the zero-`updateParts` rule reads as
"one caller, by design" rather than as drift.

**Header always visible costs vertical space** in a narrow sidebar, on every tab. Row 2
collapsing to `display:none` when `statusText` is empty keeps the idle cost to a single
row.
