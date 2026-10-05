# JSX Header (Bootstrap + GenX Status) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header row to the JSX Story Engine tab with the Bootstrap button (Opening/Continue Scene) and the GenX status surface (Continue on presence-wait, budget-wait countdown, SEGA status text).

**Architecture:** Pure JSX presentation over existing state/actions. Reactive components driven by `useSlice`, replacing the SUI `SeHeaderBar`'s imperative `updateParts`/marquee/timer machinery. A small `useCountdown` hook (recursive `api.v1.timers` tick) drives the budget-wait countdown.

**Tech Stack:** TypeScript (strict), Preact/JSX (NAI runtime globals `h`/`Fragment`/`useState`/`useEffect`/`useRef` — no import), nai-store, vitest. QuickJS (no DOM, no `setTimeout` — use `api.v1.timers`; no `console.log`).

## Global Constraints

- No backend/state/prompt changes; no `project.yaml` version bump. The build stamps `updatedAt` — revert it (`git checkout project.yaml`) before committing.
- `useSlice` selectors return primitives only (number/string/boolean) — no fresh objects/arrays (Object.is loop). Separate `useSlice` calls per primitive.
- Hooks unconditional and before any early `return null`.
- Feather icons take only `size` — no color prop.
- Timer discipline (mirror `ConfirmButton`): `api.v1.timers.setTimeout` returns `Promise<number>`; keep the id in a `useRef`, clear on unmount and when the dependency changes; a `cancelled` flag guards a late resolution.
- genx status literals are exactly `"waiting_for_user"` / `"waiting_for_budget"` (as in `SendButton.tsx`).
- Bootstrap request types: `"bootstrap"` / `"bootstrapContinue"`.
- `stageLabel`: `"⚡ Continue Scene"` if type is `"bootstrapContinue"`, else `"⚡ Opening Scene"`.
- Verify live on the **Story Engine (JSX)** tab only (icon-only S.E.G.A.; the legacy SUI panel shows the text "S.E.G.A.").

---

### Task 1: `useCountdown` hook + `remainingSeconds` helper

A 1-second tick hook for the budget-wait countdown, plus a pure, unit-tested seconds helper.

**Files:**
- Create: `src/ui-jsx/panels/header/countdown.ts`
- Test: `tests/ui-jsx/countdown.test.ts`

**Interfaces:**
- Produces: `remainingSeconds(endTime: number | null, now: number): number`; `useCountdown(endTime: number | null): number`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui-jsx/countdown.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { remainingSeconds } from "../../src/ui-jsx/panels/header/countdown";

describe("remainingSeconds", () => {
  it("returns 0 for a null endTime", () => {
    expect(remainingSeconds(null, 1000)).toBe(0);
  });

  it("returns 0 when the endTime has elapsed", () => {
    expect(remainingSeconds(5000, 5000)).toBe(0);
    expect(remainingSeconds(4000, 5000)).toBe(0);
  });

  it("ceils partial seconds", () => {
    expect(remainingSeconds(7500, 5000)).toBe(3); // 2500ms → 3s
    expect(remainingSeconds(6001, 5000)).toBe(2); // 1001ms → 2s
  });

  it("counts exact whole seconds", () => {
    expect(remainingSeconds(8000, 5000)).toBe(3); // 3000ms → 3s
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`remainingSeconds` not found)

Run: `npx vitest run tests/ui-jsx/countdown.test.ts`
Expected: FAIL (import/undefined).

- [ ] **Step 3: Implement `countdown.ts`**

Create `src/ui-jsx/panels/header/countdown.ts`:
```ts
// Budget-wait countdown for the JSX header. `remainingSeconds` is a pure helper
// (unit-tested); `useCountdown` re-renders every second while an endTime is
// active, using api.v1.timers (no setInterval in QuickJS) with ConfirmButton's
// timer/ref/cancel discipline. Date.now() is available in the UI runtime.

/** Whole seconds remaining until `endTime` (epoch ms), floored at 0. */
export function remainingSeconds(endTime: number | null, now: number): number {
  if (endTime == null) return 0;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

/** Seconds left until `endTime`, re-rendering each second while > 0. Returns 0
 *  when `endTime` is null or elapsed. */
export function useCountdown(endTime: number | null): number {
  const [, forceTick] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (endTime == null) return;
    let cancelled = false;
    const clear = () => {
      if (timerRef.current !== null) {
        void api.v1.timers.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const loop = () => {
      void api.v1.timers
        .setTimeout(() => {
          if (cancelled) return;
          forceTick((n) => n + 1);
          if (remainingSeconds(endTime, Date.now()) > 0) loop();
        }, 1000)
        .then((id: number) => {
          if (cancelled) void api.v1.timers.clearTimeout(id);
          else timerRef.current = id;
        });
    };
    loop();
    return () => {
      cancelled = true;
      clear();
    };
  }, [endTime]);

  return remainingSeconds(endTime, Date.now());
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run tests/ui-jsx/countdown.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/header/countdown.ts tests/ui-jsx/countdown.test.ts
git commit -m "feat(jsx): useCountdown hook + remainingSeconds helper for header"
```

---

### Task 2: `BootstrapButton`

The Opening/Continue Scene button: label derived from document content (undo-reactive), with queued/active states.

**Files:**
- Create: `src/ui-jsx/panels/header/BootstrapButton.tsx`

**Interfaces:**
- Consumes: `useSlice` (`../../bridge`); `store`, `bootstrapRequested`, `bootstrapContinueRequested`, `uiCancelRequest` (`../../../core/store`).
- Produces: `BootstrapButton()`.

Note: `bootstrapRequested`/`bootstrapContinueRequested` are runtime-slice actions re-exported by the `core/store` barrel (`export * from "./slices/runtime"`); import from `../../../core/store`. If not present there, import from `../../../core/store/slices/runtime`.

- [ ] **Step 1: Create `BootstrapButton.tsx`**

```tsx
// Bootstrap button for the JSX header — the Opening Scene / Continue Scene
// control, a JSX port of SeHeaderBar's bootstrap state machine. The idle label
// is derived live from the document (empty → Opening, non-empty → Continue) and
// re-derived on undo/redo (historyEpoch) and after a bootstrap settles. Queued →
// cancel; active → dimmed. Waiting states (Continue/budget) live in GenxStatus,
// not here (see the header design).

import { useSlice } from "../../bridge";
import {
  store,
  bootstrapRequested,
  bootstrapContinueRequested,
  uiCancelRequest,
} from "../../../core/store";

const stageLabel = (type?: string): string =>
  type === "bootstrapContinue" ? "⚡ Continue Scene" : "⚡ Opening Scene";

const BTN = {
  padding: "4px 8px",
  fontSize: "0.8em",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--theme-text-headings)",
  whiteSpace: "nowrap",
} as const;

export function BootstrapButton() {
  const historyEpoch = useSlice((s) => s.runtime.historyEpoch);
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

  const [hasContent, setHasContent] = useState(false);

  // Re-derive the idle label from the document on mount, after undo/redo
  // (historyEpoch), and when a bootstrap request settles (active → false).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const has = (await api.v1.document.sectionIds()).length > 0;
      if (!cancelled) setHasContent(has);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyEpoch, active]);

  // Queued: dimmed, click cancels the queued request.
  if (queuedId) {
    return (
      <button
        style={{ ...BTN, opacity: 0.4 }}
        onClick={() => store.dispatch(uiCancelRequest({ requestId: queuedId }))}
      >
        {stageLabel(pendingType)}
      </button>
    );
  }

  // Active/generating: dimmed, non-interactive (waiting states show in GenxStatus).
  if (active) {
    return (
      <button style={{ ...BTN, opacity: 0.4, cursor: "default" }} disabled>
        {stageLabel(pendingType)}
      </button>
    );
  }

  // Idle: derived from document content.
  return (
    <button
      style={{ ...BTN, opacity: 0.85 }}
      onClick={() =>
        store.dispatch(
          hasContent ? bootstrapContinueRequested() : bootstrapRequested(),
        )
      }
    >
      {hasContent ? "⚡ Continue Scene" : "⚡ Opening Scene"}
    </button>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit` → exit 0. (`BootstrapButton` is exported but not yet imported — Task 3 wires it; `noUnusedLocals` won't flag an exported symbol.)
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.

- [ ] **Step 3: Commit**

```bash
git add src/ui-jsx/panels/header/BootstrapButton.tsx
git commit -m "feat(jsx): BootstrapButton — Opening/Continue Scene, undo-reactive"
```

---

### Task 3: `GenxStatus` + `Header` shell + placement

The live-status surface + the header row, placed atop the Story Engine view.

**Files:**
- Create: `src/ui-jsx/panels/header/GenxStatus.tsx`
- Create: `src/ui-jsx/panels/header/Header.tsx`
- Modify: `src/ui-jsx/panels/StoryEngine.tsx`

**Interfaces:**
- Consumes: `useSlice` (`../../bridge`); `store`, `uiUserPresenceConfirmed`, `uiRequestCancellation` (`../../../core/store`); `useCountdown` (`./countdown`); `BootstrapButton` (`./BootstrapButton`); `GenxStatus` (`./GenxStatus`); `T`, `SP` (`../../style` / `../../../ui-jsx/style` as used elsewhere — match sibling imports).

- [ ] **Step 1: Create `GenxStatus.tsx`**

```tsx
// GenX status surface for the JSX header — the single home for live generation
// feedback (any active gen): a Continue button on presence-wait, a budget-wait
// countdown, else the SEGA status text (truncated, no marquee). Mirrors the
// genx.status branching in SendButton.tsx.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  uiUserPresenceConfirmed,
  uiRequestCancellation,
} from "../../../core/store";
import { useCountdown } from "./countdown";

export function GenxStatus() {
  const status = useSlice((s) => s.runtime.genx.status);
  const budgetEnd = useSlice((s) => s.runtime.genx.budgetWaitEndTime ?? null);
  const statusText = useSlice((s) => s.runtime.sega.statusText);
  const secs = useCountdown(status === "waiting_for_budget" ? budgetEnd : null);

  if (status === "waiting_for_user") {
    return (
      <button
        style={{
          padding: "4px 8px",
          fontSize: "0.8em",
          borderRadius: "4px",
          border: "none",
          cursor: "pointer",
          background: T.textHeadings,
          color: T.bg,
          fontWeight: "bold",
        }}
        onClick={() => store.dispatch(uiUserPresenceConfirmed())}
      >
        ⚠️ Continue
      </button>
    );
  }

  if (status === "waiting_for_budget") {
    return (
      <button
        title="Cancel"
        style={{
          padding: "4px 8px",
          fontSize: "0.8em",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: T.text,
          opacity: 0.8,
        }}
        onClick={() => store.dispatch(uiRequestCancellation())}
      >
        ⏳ Wait ({secs}s)
      </button>
    );
  }

  // Idle/generating: truncated SEGA status text (empty renders nothing visible).
  return (
    <span
      style={{
        fontSize: "0.8em",
        opacity: 0.8,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {statusText}
    </span>
  );
}
```

- [ ] **Step 2: Create `Header.tsx`**

```tsx
// JSX header row for the Story Engine tab: GenX status (left, grows) + the
// Bootstrap button (right). Import wizard is a later slice.

import { SP } from "../../style";
import { GenxStatus } from "./GenxStatus";
import { BootstrapButton } from "./BootstrapButton";

export function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SP.sm,
        paddingBottom: SP.sm,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}>
        <GenxStatus />
      </div>
      <BootstrapButton />
    </div>
  );
}
```

- [ ] **Step 3: Place `<Header />` in StoryEngine.tsx**

In `src/ui-jsx/panels/StoryEngine.tsx`, import `Header` and render it at the top of the main-view stack (above `<Foundation />`):
```tsx
import { Header } from "./header/Header";
...
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Header />
      <Foundation />
      <ForgeSection />
      <World />
    </div>
  );
```
(Leave the entity/thread edit-pane early returns unchanged, so the header shows only on the main view.)

- [ ] **Step 4: tsc + build + full suite**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → `✅ Built`. Then `git checkout project.yaml`.
Run: `npx vitest run` → all passing (Task 1's countdown test + no regressions).

- [ ] **Step 5: Update CHANGELOG + commit**

Add to the `## [0.14.0]` `### Added` section a release-note bullet: the JSX panel gains a header — an **Opening Scene / Continue Scene** button (writes the cold open, then extends it a paragraph per click; reflects undo) plus live generation status (a **Continue** prompt when generation waits on you, a budget-wait countdown, and the S.E.G.A. status line). Match the existing 0.14.0 bullet voice.

```bash
git add src/ui-jsx/panels/header/GenxStatus.tsx src/ui-jsx/panels/header/Header.tsx src/ui-jsx/panels/StoryEngine.tsx CHANGELOG.md
git commit -m "feat(jsx): header — Bootstrap button + GenX status surface"
```

---

## Live Verification (after all tasks, batched with the user)

On the **Story Engine (JSX)** tab (confirm icon-only S.E.G.A.):

1. With an **empty document**, the header button reads **⚡ Opening Scene**. Click → the cold open is written to the document; the button flips to **⚡ Continue Scene**.
2. Click **⚡ Continue Scene** → one paragraph is appended.
3. **Undo** the opening in the editor → the button flips back to **⚡ Opening Scene** (historyEpoch reactivity).
4. During a bootstrap/other generation that waits on presence, **⚠️ Continue** appears in the status area; click resumes. A budget wait shows **⏳ Wait (Ns)** counting down. A S.E.G.A. run shows its status line (truncated).

## Notes for the executor

- `useState`/`useEffect`/`useRef`/`h`/`Fragment` are NAI globals in `.ts`/`.tsx` (hooks.ts uses `useState` in a `.ts` file) — no import. The `countdown.ts` test imports only the pure `remainingSeconds`, so `useCountdown`'s globals are never evaluated at test time.
- `api.v1.timers.setTimeout` returns `Promise<number>`; `api.v1.document.sectionIds()` returns `Promise<string[]>`.
- Match sibling files for the `T`/`SP` import path (`../../style` from `panels/header/`).
- Remove any import `noUnusedLocals` flags; do not suppress. Do not bump `project.yaml`.
