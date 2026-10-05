# UIPart Header + Centralised GenX State Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the Story Engine header out of JSX and into NovelAI UIParts, so that clicking it clears the harness's FlagB interaction flag and generation can be un-stalled, and make that header the single home for the GenX state machine.

**Architecture:** A `container` UIPart becomes the sidebar root, holding a header (row of three buttons + a status text row) above the existing JSX panel. Three new pure/impure-separated files: `header-model.ts` derives a `HeaderModel` from `RootState`, `header-parts.ts` turns that model into UIPart specs and diffs two models into an `updateParts` payload, and `header-driver.ts` — the only file permitted to call `api.v1.ui.updateParts` — wakes on a store subscription and a self-rescheduling timer.

**Tech Stack:** TypeScript (strict), NovelAI script API (`external/script-types.d.ts`), `nai-store`, `nai-gen-x`, Preact via the NAI JSX runtime, vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-uipart-header-genx-design.md`

## Global Constraints

- Runs in QuickJS in a web worker: **no DOM, no `setTimeout`** (use `api.v1.timers`), **no `console.log`** (use `api.v1.log()`).
- Strict TypeScript: `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`. An import left unused after an edit is a **compile error**, not a warning.
- Trust `external/script-types.d.ts` implicitly. No defensive existence checks around API calls. Avoid `any` casts on API interactions.
- **No singletons or module-level mutable state.** Use factory functions with dependency injection wired in `src/ui/mount.ts`.
- `api.v1.ui.updateParts` **replaces style wholesale** — any pushed `style` object must contain every CSS property that part needs, not a delta.
- Colours come from `T` in `src/ui/style.ts` (all `var(--theme-*)` refs). Never a literal hex.
- Spacing comes from `SP` in `src/ui/style.ts`.
- **Do not bump `project.yaml` `version`.** It is already at `0.14.0`, bumped earlier on this branch (`v14`); CLAUDE.md permits at most one bump per pull request. Update the existing `## [0.14.0]` CHANGELOG section instead. *If 0.14.0 has actually shipped, stop and ask before proceeding to Task 6.*
- Commands: `npm test` (vitest run), `npm run build` (nibs → `dist/NAI-story-engine.naiscript`), `npm run format` (prettier).
- Typecheck with `npx tsc --noEmit`.

---

## File Structure

| Path | Responsibility | Status |
|---|---|---|
| `src/ui/header/header-model.ts` | `derive`, `storeSignature`, `formatOutputBudget` — all pure | create (Task 2) |
| `src/ui/header/header-parts.ts` | `buildRoot`, `buildHeader`, `patch`, style helpers — all pure | create (Task 1, extended Task 3) |
| `src/ui/header/header-driver.ts` | `createHeaderDriver` — subscription, timer, `updateParts` | create (Task 4) |
| `src/ui/header/countdown.ts` | `remainingSeconds`, `waitLabel` | moved (Task 2), trimmed (Task 5) |
| `src/ui/mount.ts` | panel construction + driver lifecycle | modify (Tasks 1, 4) |
| `src/ui/panels/StoryEngine.tsx` | drop `<Header>` | modify (Task 4) |
| `src/ui/panels/chat/SendButton.tsx` | idle/disabled only | modify (Task 5) |
| `src/ui/panels/header/` | whole directory | delete (Tasks 2, 4) |
| `tests/setup.ts` | API mocks | modify (Task 1) |
| `tests/ui/header-model.test.ts` | model + signature coverage | create (Task 2) |
| `tests/ui/header-parts.test.ts` | spec + diff coverage | create (Tasks 1, 3) |
| `tests/ui/countdown.test.ts` | inverted state-machine guard | modify (Tasks 2, 5) |

---

### Task 1: Grid root and the height contract

The sidebar currently relies on the jsx part's own `display:grid / gridTemplateRows:minmax(0,1fr) / height:100%` wrapper so the chat list scrolls internally and the composer pins to the bottom. Introducing a parent means that contract must survive one more level. This task does *only* that, with a placeholder header, so the layout can be verified live before anything is built on top of it.

**Files:**
- Create: `src/ui/header/header-parts.ts`
- Create: `tests/ui/header-parts.test.ts`
- Modify: `tests/setup.ts`
- Modify: `src/ui/mount.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `HEADER_IDS` (frozen id map), `buildRoot(header: UIPart, body: UIPart): UIPart`.

- [ ] **Step 1: Add the missing API mocks**

`tests/setup.ts` mocks `api.v1.ui.part.button/text/column/row` but not `container` or `jsx`, and has no `api.v1.document`. In `tests/setup.ts`, inside the `part: { ... }` object, add these two entries alongside the existing ones:

```ts
        container: vi.fn((props) => ({ ...props, type: "container" })),
        jsx: vi.fn((props) => ({ ...props, type: "jsx" })),
```

And add a `document` namespace as a sibling of `ui` (e.g. immediately after the closing brace of `ui`):

```ts
    document: {
      sectionIds: vi.fn().mockResolvedValue([]),
    },
```

- [ ] **Step 2: Write the failing test**

Create `tests/ui/header-parts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRoot, HEADER_IDS } from "../../src/ui/header/header-parts";

describe("buildRoot", () => {
  const header = { type: "text", id: "stub-header" } as unknown as UIPart;
  const body = { type: "jsx", id: "stub-body" } as unknown as UIPart;

  it("wraps header and body in a two-row grid", () => {
    const root = buildRoot(header, body) as unknown as {
      id: string;
      style: Record<string, string>;
      content: UIPart[];
    };
    expect(root.id).toBe(HEADER_IDS.root);
    expect(root.content).toEqual([header, body]);
  });

  it("lets the body row shrink below its content", () => {
    // minmax(0, 1fr) is the pixel-free equivalent of min-height:0. Without it
    // the jsx panel grows to fit the chat list and the composer scrolls away.
    const root = buildRoot(header, body) as unknown as {
      style: Record<string, string>;
    };
    expect(root.style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect(root.style.height).toBe("100%");
    expect(root.style.minHeight).toBe("0");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/ui/header-parts.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/header/header-parts"`.

- [ ] **Step 4: Write the minimal implementation**

Create `src/ui/header/header-parts.ts`:

```ts
// Pure UIPart specs for the Story Engine header. No api.v1.ui mutation happens
// here — header-driver.ts owns every updateParts call. Keeping construction
// pure is what makes the header's four states testable without a browser.

export const HEADER_IDS = {
  root: "kse-root",
  header: "kse-header",
  row1: "kse-header-row1",
  widget: "kse-widget",
  import: "kse-import",
  bootstrap: "kse-bootstrap",
  status: "kse-header-status",
} as const;

/** Grid root for the sidebar: header sized to its content, body taking the
 *  rest. The body row is `minmax(0, 1fr)` — the pixel-free equivalent of
 *  min-height:0 — so the jsx panel can shrink below its content and the chat
 *  list scrolls internally instead of growing the panel. */
export function buildRoot(header: UIPart, body: UIPart): UIPart {
  return api.v1.ui.part.container({
    id: HEADER_IDS.root,
    style: {
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    content: [header, body],
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ui/header-parts.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Wire the root into mount.ts with a placeholder header**

In `src/ui/mount.ts`, add the import near the other local imports:

```ts
import { buildRoot, HEADER_IDS } from "./header/header-parts";
```

Then in `buildSidebarPanel()`, replace the `return sidebarPanel({ ... })` block with:

```ts
  // Placeholder until Task 3 builds the real header. Present now so the grid
  // height contract can be verified live with a real occupied top row.
  const placeholderHeader = api.v1.ui.part.text({
    id: HEADER_IDS.status,
    text: "header placeholder",
    noTemplate: true,
    style: { fontSize: "0.8em", opacity: "0.8", padding: "4px 8px" },
  });

  return sidebarPanel({
    id: "kse-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [buildRoot(placeholderHeader, jsxPart)],
  });
```

Leave the `jsxPart` definition, including its own `style` block, exactly as it is — it is now a grid *item* and still needs its internal `minmax(0, 1fr)`.

- [ ] **Step 7: Typecheck, test, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests pass; `dist/NAI-story-engine.naiscript` written.

- [ ] **Step 8: Verify the height contract live — this is a blocking gate**

Load `dist/NAI-story-engine.naiscript` into NovelAI, open the Story Engine sidebar and check all four:

1. "header placeholder" appears above the Chat / Story Engine tab bar.
2. On the **Chat** tab with enough messages to overflow: the message list scrolls **inside** its own box.
3. The chat composer stays **pinned to the bottom** and does not scroll away.
4. On the **Story Engine** tab: the body scrolls normally and the placeholder stays put.

If 2 or 3 fail, the grid contract did not propagate. Do not continue — the fix belongs here. First thing to try: add `minHeight: "0"` to the `jsxPart` style (it is already there) and confirm the root's `gridTemplateRows` is not being overridden by the panel wrapper; if it is, try `display: "flex", flexDirection: "column"` on the root with `flex: "1 1 0%", minHeight: "0"` on the jsx part instead.

- [ ] **Step 9: Commit**

```bash
git add src/ui/header/header-parts.ts tests/ui/header-parts.test.ts tests/setup.ts src/ui/mount.ts
git commit -m "feat(ui): add UIPart grid root above the JSX sidebar panel"
```

---

### Task 2: The header model

The pure derivation: one function that turns store state plus three external inputs into everything the header displays. This is the file that owns the generation state machine.

**Files:**
- Move: `src/ui/panels/header/countdown.ts` → `src/ui/header/countdown.ts`
- Modify: `src/ui/panels/chat/SendButton.tsx` (import path only)
- Modify: `src/ui/panels/header/GenxStatus.tsx` (import path only)
- Modify: `tests/ui/countdown.test.ts` (import path only)
- Create: `src/ui/header/header-model.ts`
- Create: `tests/ui/header-model.test.ts`

**Interfaces:**
- Consumes: `remainingSeconds`, `waitLabel` from `./countdown`.
- Produces:
  - `type WidgetMode = "budget" | "cancel" | "continue" | "wait"`
  - `type HeaderModel = { widget: { mode: WidgetMode; text: string }; statusText: string; bootstrap: { text: string; disabled: boolean }; importDisabled: boolean }`
  - `type DeriveInputs = { allowedOutput: number; hasDocumentContent: boolean; now: number }`
  - `derive(state: RootState, inputs: DeriveInputs): HeaderModel`
  - `storeSignature(state: RootState): string`
  - `formatOutputBudget(tokens: number): string`

- [ ] **Step 1: Move countdown.ts and fix its three importers**

```bash
git mv src/ui/panels/header/countdown.ts src/ui/header/countdown.ts
```

`useCountdown` stays for now — `SendButton` and `GenxStatus` still use it; it is deleted in Task 5. Update the import paths:

- `src/ui/panels/chat/SendButton.tsx` line 20: `from "../header/countdown"` → `from "../../header/countdown"`
- `src/ui/panels/header/GenxStatus.tsx` line 13: `from "./countdown"` → `from "../../header/countdown"`
- `tests/ui/countdown.test.ts` line 6 region: the import of `waitLabel` / `remainingSeconds` → `from "../../src/ui/header/countdown"`

Run `npx tsc --noEmit` and confirm it is clean before continuing.

- [ ] **Step 2: Write the failing test**

Create `tests/ui/header-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  derive,
  storeSignature,
  formatOutputBudget,
  type DeriveInputs,
} from "../../src/ui/header/header-model";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialUIState } from "../../src/core/store/slices/ui";
import type { RootState } from "../../src/core/store";
import type {
  GenerationRequest,
  RuntimeState,
  UIState,
} from "../../src/core/store/types";

const INPUTS: DeriveInputs = {
  allowedOutput: 4200,
  hasDocumentContent: false,
  now: 1_000_000,
};

function req(
  type: GenerationRequest["type"],
  id: string,
): GenerationRequest {
  return { id, type, targetId: "t", status: "queued" };
}

function state(
  runtime: Partial<RuntimeState> = {},
  ui: Partial<UIState> = {},
): RootState {
  return {
    runtime: { ...initialRuntimeState, ...runtime },
    ui: { ...initialUIState, ...ui },
  } as RootState;
}

describe("formatOutputBudget", () => {
  it("prints a bare count below 1k", () => {
    expect(formatOutputBudget(412)).toBe("412 out");
    expect(formatOutputBudget(999)).toBe("999 out");
  });

  it("switches to one-decimal k at 1000", () => {
    expect(formatOutputBudget(1000)).toBe("1.0k out");
    expect(formatOutputBudget(1234)).toBe("1.2k out");
  });
});

describe("derive — widget mode", () => {
  it("shows the output budget when idle", () => {
    const m = derive(state(), INPUTS);
    expect(m.widget).toEqual({ mode: "budget", text: "4.2k out" });
  });

  it("shows Continue while waiting on the user", () => {
    const m = derive(
      state({ genx: { status: "waiting_for_user", queueLength: 0 } }),
      INPUTS,
    );
    expect(m.widget).toEqual({ mode: "continue", text: "⚠️ Continue" });
  });

  it("counts down while waiting on budget", () => {
    const m = derive(
      state({
        genx: {
          status: "waiting_for_budget",
          queueLength: 0,
          budgetWaitEndTime: INPUTS.now + 12_000,
        },
      }),
      INPUTS,
    );
    expect(m.widget).toEqual({ mode: "wait", text: "⏳ Wait (12s)" });
  });

  it("offers Cancel while generating and while queued", () => {
    for (const status of ["generating", "queued"] as const) {
      const m = derive(state({ genx: { status, queueLength: 1 } }), INPUTS);
      expect(m.widget).toEqual({ mode: "cancel", text: "🚫 Cancel" });
    }
  });

  it("falls back to budget for completed and failed", () => {
    for (const status of ["completed", "failed"] as const) {
      const m = derive(state({ genx: { status, queueLength: 0 } }), INPUTS);
      expect(m.widget.mode).toBe("budget");
    }
  });
});

describe("derive — bootstrap, status text, import", () => {
  it("labels bootstrap from document content", () => {
    expect(derive(state(), INPUTS).bootstrap.text).toBe("⚡ Opening Scene");
    expect(
      derive(state(), { ...INPUTS, hasDocumentContent: true }).bootstrap.text,
    ).toBe("⚡ Continue Scene");
  });

  it("disables bootstrap while its request is queued", () => {
    const m = derive(state({ queue: [req("bootstrap", "b1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("disables bootstrap while its request is active", () => {
    const m = derive(
      state({
        activeRequest: { ...req("bootstrapContinue", "b2"), status: "processing" },
      }),
      INPUTS,
    );
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("leaves bootstrap enabled for unrelated work", () => {
    const m = derive(state({ queue: [req("foundation", "f1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(false);
  });

  it("passes SEGA status text straight through", () => {
    const m = derive(
      state({
        sega: { ...initialRuntimeState.sega, statusText: "Characters 3/7" },
      }),
      INPUTS,
    );
    expect(m.statusText).toBe("Characters 3/7");
  });

  it("disables import only while the wizard is open", () => {
    expect(derive(state(), INPUTS).importDisabled).toBe(false);
    expect(
      derive(state({}, { importWizardOpen: true }), INPUTS).importDisabled,
    ).toBe(true);
  });
});

describe("storeSignature", () => {
  it("is stable for an unchanged state", () => {
    expect(storeSignature(state())).toBe(storeSignature(state()));
  });

  it("changes when a same-length queue swaps contents", () => {
    // The load-bearing case: cancelling a queued bootstrap while a foundation
    // request is enqueued leaves queue.length at 1, but bootstrap.disabled has
    // to flip. A length-only signature would miss it and go stale.
    const before = storeSignature(state({ queue: [req("bootstrap", "b1")] }));
    const after = storeSignature(state({ queue: [req("foundation", "f1")] }));
    expect(before).not.toBe(after);
  });

  it("changes for every field derive reads", () => {
    const base = storeSignature(state());
    const variants = [
      state({ genx: { status: "generating", queueLength: 0 } }),
      state({
        genx: { status: "idle", queueLength: 0, budgetWaitEndTime: 5 },
      }),
      state({ sega: { ...initialRuntimeState.sega, statusText: "x" } }),
      state({ queue: [req("bootstrap", "b1")] }),
      state({
        activeRequest: { ...req("chat", "c1"), status: "processing" },
      }),
      state({ historyEpoch: 1 }),
      state({}, { importWizardOpen: true }),
    ];
    for (const v of variants) {
      expect(storeSignature(v)).not.toBe(base);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/ui/header-model.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/header/header-model"`.

- [ ] **Step 4: Write the implementation**

Create `src/ui/header/header-model.ts`:

```ts
// Pure derivation for the UIPart header.
//
// `derive` is the ONLY place in the codebase that branches on genx.status —
// every other surface keys off per-target request ids. tests/ui/countdown.test.ts
// enforces that mechanically.
//
// `storeSignature` is the change-detection key the driver subscribes with. It
// must cover every store field `derive` reads: a missing field means the header
// silently goes stale until the next timer tick rather than failing loudly.

import type { RootState } from "../../core/store";
import { remainingSeconds, waitLabel } from "./countdown";

export type WidgetMode = "budget" | "cancel" | "continue" | "wait";

export type HeaderModel = {
  widget: { mode: WidgetMode; text: string };
  /** Empty string collapses the status row to display:none. */
  statusText: string;
  bootstrap: { text: string; disabled: boolean };
  importDisabled: boolean;
};

export type DeriveInputs = {
  /** api.v1.script.getAllowedOutput() */
  allowedOutput: number;
  /** Cached async read of api.v1.document.sectionIds(); the driver owns it. */
  hasDocumentContent: boolean;
  /** Date.now(), injected so derive stays pure. */
  now: number;
};

const BOOTSTRAP_TYPES: readonly string[] = ["bootstrap", "bootstrapContinue"];

/** "412 out" below 1k, "1.2k out" at or above it. No ⚡ — the bolt belongs to
 *  the action buttons, so the readout doesn't read as a third action. */
export function formatOutputBudget(tokens: number): string {
  const n = tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`;
  return `${n} out`;
}

function deriveWidget(
  state: RootState,
  inputs: DeriveInputs,
): HeaderModel["widget"] {
  const { genx } = state.runtime;
  if (genx.status === "waiting_for_user") {
    return { mode: "continue", text: "⚠️ Continue" };
  }
  if (genx.status === "waiting_for_budget") {
    const secs = remainingSeconds(genx.budgetWaitEndTime ?? null, inputs.now);
    return { mode: "wait", text: waitLabel(secs) };
  }
  if (genx.status === "queued" || genx.status === "generating") {
    return { mode: "cancel", text: "🚫 Cancel" };
  }
  return { mode: "budget", text: formatOutputBudget(inputs.allowedOutput) };
}

export function derive(state: RootState, inputs: DeriveInputs): HeaderModel {
  const { sega, queue, activeRequest } = state.runtime;

  const bootstrapPending =
    queue.some((r) => BOOTSTRAP_TYPES.includes(r.type)) ||
    (activeRequest !== null && BOOTSTRAP_TYPES.includes(activeRequest.type));

  return {
    widget: deriveWidget(state, inputs),
    statusText: sega.statusText,
    bootstrap: {
      text: inputs.hasDocumentContent ? "⚡ Continue Scene" : "⚡ Opening Scene",
      disabled: bootstrapPending,
    },
    importDisabled: state.ui.importWizardOpen,
  };
}

export function storeSignature(state: RootState): string {
  const { genx, sega, queue, activeRequest, historyEpoch } = state.runtime;
  return [
    genx.status,
    genx.budgetWaitEndTime ?? "",
    sega.statusText,
    // Full composition, not length: a same-size queue with different contents
    // changes what the header shows.
    queue.map((r) => `${r.type}:${r.id}`).join(","),
    activeRequest?.id ?? "",
    state.ui.importWizardOpen ? "1" : "0",
    historyEpoch,
  ].join("|");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/header-model.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; every test passes (the countdown import move must not have broken anything).

- [ ] **Step 7: Commit**

```bash
git add src/ui/header/ src/ui/panels/header/GenxStatus.tsx src/ui/panels/chat/SendButton.tsx tests/ui/header-model.test.ts tests/ui/countdown.test.ts
git commit -m "feat(ui): add pure header model deriving the GenX state machine"
```

---

### Task 3: Header part specs and the diff

Turn a `HeaderModel` into UIPart specs, and turn two models into the minimal `updateParts` payload.

**Files:**
- Modify: `src/ui/header/header-parts.ts`
- Modify: `tests/ui/header-parts.test.ts`

**Interfaces:**
- Consumes: `HeaderModel`, `WidgetMode` from `./header-model`; `T`, `SP` from `../style`.
- Produces:
  - `type HeaderHandlers = { onWidget: () => void; onImport: () => void; onBootstrap: () => void }`
  - `buildHeader(model: HeaderModel, handlers: HeaderHandlers): UIPart`
  - `patch(prev: HeaderModel | null, next: HeaderModel): Partial<UIPart>[]`
  - `widgetStyle(mode: WidgetMode): Record<string, string>`
  - `statusStyle(statusText: string): Record<string, string>`

- [ ] **Step 1: Write the failing tests**

Keep the existing `buildRoot` describe block. **Replace** the Task 1 import line
(`import { buildRoot, HEADER_IDS } from "../../src/ui/header/header-parts";`) with the
combined import below — do not add a second import from the same path, or `HEADER_IDS`
becomes a duplicate identifier. Then append the new describe blocks.

```ts
import {
  buildRoot,
  buildHeader,
  patch,
  widgetStyle,
  statusStyle,
  HEADER_IDS,
  type HeaderHandlers,
} from "../../src/ui/header/header-parts";
import type { HeaderModel } from "../../src/ui/header/header-model";

const HANDLERS: HeaderHandlers = {
  onWidget: () => {},
  onImport: () => {},
  onBootstrap: () => {},
};

const MODEL: HeaderModel = {
  widget: { mode: "budget", text: "4.2k out" },
  statusText: "",
  bootstrap: { text: "⚡ Opening Scene", disabled: false },
  importDisabled: false,
};

function findPart(tree: unknown, id: string): Record<string, any> | null {
  const node = tree as { id?: string; content?: unknown[] };
  if (node?.id === id) return node as Record<string, any>;
  for (const child of node?.content ?? []) {
    const hit = findPart(child, id);
    if (hit) return hit;
  }
  return null;
}

describe("widgetStyle", () => {
  it("returns a complete style for every mode", () => {
    // updateParts replaces style wholesale, so a mode that omits a property
    // another mode sets would leave that property stuck from the last push.
    const modes = ["budget", "cancel", "continue", "wait"] as const;
    const keySets = modes.map((m) => Object.keys(widgetStyle(m)).sort());
    for (const keys of keySets) expect(keys).toEqual(keySets[0]);
  });

  it("never emits a literal colour", () => {
    for (const mode of ["budget", "cancel", "continue", "wait"] as const) {
      for (const value of Object.values(widgetStyle(mode))) {
        expect(value).not.toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
  });
});

describe("statusStyle", () => {
  it("collapses the row when there is no status text", () => {
    expect(statusStyle("").display).toBe("none");
    expect(statusStyle("Characters 3/7").display).toBe("block");
  });
});

describe("buildHeader", () => {
  it("emits all four addressable parts with stable ids", () => {
    const header = buildHeader(MODEL, HANDLERS);
    for (const id of [
      HEADER_IDS.widget,
      HEADER_IDS.import,
      HEADER_IDS.bootstrap,
      HEADER_IDS.status,
    ]) {
      expect(findPart(header, id), id).not.toBeNull();
    }
  });

  it("never disables the widget — a disabled button clears no FlagB", () => {
    const busy: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    expect(findPart(buildHeader(busy, HANDLERS), HEADER_IDS.widget)!.disabled)
      .toBeUndefined();
  });

  it("marks the status text as non-templated", () => {
    // SEGA text can contain braces; {{...}} would be read as a storage key.
    const header = buildHeader(MODEL, HANDLERS);
    expect(findPart(header, HEADER_IDS.status)!.noTemplate).toBe(true);
  });
});

describe("patch", () => {
  it("pushes everything on the first call", () => {
    expect(patch(null, MODEL)).toHaveLength(4);
  });

  it("pushes nothing when the model is unchanged", () => {
    expect(patch(MODEL, { ...MODEL })).toEqual([]);
  });

  it("pushes only the widget when only the widget changed", () => {
    const next: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe(HEADER_IDS.widget);
    expect(parts[0].text).toBe("🚫 Cancel");
  });

  it("carries the complete style object, not a delta", () => {
    const next: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(Object.keys(parts[0].style).sort()).toEqual(
      Object.keys(widgetStyle("cancel")).sort(),
    );
  });

  it("pushes the status row when its text changes", () => {
    const next: HeaderModel = { ...MODEL, statusText: "Characters 3/7" };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe(HEADER_IDS.status);
    expect(parts[0].style.display).toBe("block");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/header-parts.test.ts`
Expected: FAIL — `buildHeader is not exported` / `does not provide an export named 'buildHeader'`.

- [ ] **Step 3: Write the implementation**

Append to `src/ui/header/header-parts.ts` (keep `HEADER_IDS` and `buildRoot`, and add the imports at the top of the file):

```ts
import { SP, T } from "../style";
import type { HeaderModel, WidgetMode } from "./header-model";

export type HeaderHandlers = {
  onWidget: () => void;
  onImport: () => void;
  onBootstrap: () => void;
};

// Every widgetStyle branch spreads this, so all four modes emit the same key
// set — required because updateParts replaces style wholesale.
const WIDGET_BASE = {
  padding: "4px 8px",
  fontSize: "0.8em",
  borderRadius: "4px",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

export function widgetStyle(mode: WidgetMode): Record<string, string> {
  switch (mode) {
    case "continue":
      return {
        ...WIDGET_BASE,
        background: T.textHeadings,
        color: T.bg,
        fontWeight: "bold",
        opacity: "1",
      };
    case "cancel":
      return {
        ...WIDGET_BASE,
        background: T.warning,
        color: T.bg,
        fontWeight: "bold",
        opacity: "1",
      };
    case "wait":
      return {
        ...WIDGET_BASE,
        background: T.bg2,
        color: T.text,
        fontWeight: "normal",
        opacity: "1",
      };
    case "budget":
      return {
        ...WIDGET_BASE,
        background: "transparent",
        color: T.text,
        fontWeight: "normal",
        opacity: "0.8",
      };
  }
}

/** Collapses to display:none when there is nothing to say, so the idle header
 *  costs a single row. */
export function statusStyle(statusText: string): Record<string, string> {
  return {
    display: statusText ? "block" : "none",
    fontSize: "0.8em",
    opacity: "0.8",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
}

const ICON_STYLE: Record<string, string> = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "2px",
};

const BOOTSTRAP_STYLE: Record<string, string> = {
  padding: "4px 8px",
  fontSize: "0.8em",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.textHeadings,
  whiteSpace: "nowrap",
  opacity: "0.85",
};

/** Handlers are registered once and never re-registered: updateParts only ever
 *  carries text/disabled/style. Each callback reads the live store at click
 *  time, so one static handler covers all of the widget's four modes. */
export function buildHeader(
  model: HeaderModel,
  handlers: HeaderHandlers,
): UIPart {
  return api.v1.ui.part.container({
    id: HEADER_IDS.header,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: SP.sm,
      padding: SP.sm,
      borderBottom: `1px solid ${T.bg3}`,
      flexShrink: "0",
    },
    content: [
      api.v1.ui.part.row({
        id: HEADER_IDS.row1,
        alignment: "center",
        spacing: "space-between",
        style: { gap: SP.sm },
        content: [
          // Never disabled: a disabled button fires no click and would clear
          // no FlagB, which is the entire reason this header exists.
          api.v1.ui.part.button({
            id: HEADER_IDS.widget,
            text: model.widget.text,
            style: widgetStyle(model.widget.mode),
            callback: handlers.onWidget,
          }),
          api.v1.ui.part.button({
            id: HEADER_IDS.import,
            iconId: "download",
            disabled: model.importDisabled,
            style: ICON_STYLE,
            callback: handlers.onImport,
          }),
          api.v1.ui.part.button({
            id: HEADER_IDS.bootstrap,
            text: model.bootstrap.text,
            disabled: model.bootstrap.disabled,
            // A tap can deliver click twice on mobile; bootstrap is the one
            // non-idempotent header action.
            disabledWhileCallbackRunning: true,
            style: BOOTSTRAP_STYLE,
            callback: handlers.onBootstrap,
          }),
        ],
      }),
      api.v1.ui.part.text({
        id: HEADER_IDS.status,
        text: model.statusText,
        // SEGA text may contain braces; {{...}} would be read as a storage key.
        noTemplate: true,
        style: statusStyle(model.statusText),
      }),
    ],
  });
}

/** Minimal updateParts payload between two models. `prev === null` means first
 *  push. Style objects are always complete — never a delta. */
export function patch(
  prev: HeaderModel | null,
  next: HeaderModel,
): Partial<UIPart>[] {
  const parts: Partial<UIPart>[] = [];

  if (
    !prev ||
    prev.widget.text !== next.widget.text ||
    prev.widget.mode !== next.widget.mode
  ) {
    parts.push({
      id: HEADER_IDS.widget,
      text: next.widget.text,
      style: widgetStyle(next.widget.mode),
    } as Partial<UIPart>);
  }

  if (!prev || prev.importDisabled !== next.importDisabled) {
    parts.push({
      id: HEADER_IDS.import,
      disabled: next.importDisabled,
    } as Partial<UIPart>);
  }

  if (
    !prev ||
    prev.bootstrap.text !== next.bootstrap.text ||
    prev.bootstrap.disabled !== next.bootstrap.disabled
  ) {
    parts.push({
      id: HEADER_IDS.bootstrap,
      text: next.bootstrap.text,
      disabled: next.bootstrap.disabled,
    } as Partial<UIPart>);
  }

  if (!prev || prev.statusText !== next.statusText) {
    parts.push({
      id: HEADER_IDS.status,
      text: next.statusText,
      style: statusStyle(next.statusText),
    } as Partial<UIPart>);
  }

  return parts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/header-parts.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/header/header-parts.ts tests/ui/header-parts.test.ts
git commit -m "feat(ui): build header UIPart specs and diff from the header model"
```

---

### Task 4: The driver, and retiring the JSX header

Wire the model and parts to the live store, then delete the three JSX components they replace. After this task the header is fully functional.

**Files:**
- Create: `src/ui/header/header-driver.ts`
- Modify: `src/ui/mount.ts`
- Modify: `src/ui/panels/StoryEngine.tsx`
- Delete: `src/ui/panels/header/GenxStatus.tsx`, `src/ui/panels/header/Header.tsx`, `src/ui/panels/header/BootstrapButton.tsx`

**Interfaces:**
- Consumes: `derive`, `storeSignature`, `HeaderModel` from `./header-model`; `buildHeader`, `patch`, `HeaderHandlers` from `./header-parts`; `store` and the action creators from `../../core/store`.
- Produces: `createHeaderDriver(store: Store): { initialModel(): HeaderModel; handlers: HeaderHandlers; start(): void; stop(): void }`

- [ ] **Step 1: Write the implementation**

Create `src/ui/header/header-driver.ts`:

```ts
// The one file allowed to call api.v1.ui.updateParts.
//
// It holds no decisions: derive() decides, patch() diffs, this pushes. Two wake
// sources feed one tick — a store subscription (subscribeSelector on
// storeSignature does the change detection) and a self-rescheduling timer.
// Only timer ticks re-arm the timer, so a burst of dispatches cannot stack
// parallel chains.
//
// No module-level state: everything lives in the closure so the driver is
// injected from mount.ts rather than being a singleton.

import {
  store as storeInstance,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  importWizardOpened,
  bootstrapRequested,
  bootstrapContinueRequested,
} from "../../core/store";
import { derive, storeSignature, type HeaderModel } from "./header-model";
import { buildHeader, patch, type HeaderHandlers } from "./header-parts";

/** 1s while counting down so the label ticks; 5s otherwise, which is only
 *  there to notice the output bucket silently refilling. */
const TICK_WAIT_MS = 1000;
const TICK_IDLE_MS = 5000;

export type HeaderDriver = {
  /** Model for the first paint. Call before buildHeader so the initial specs
   *  are already correct and no updateParts is needed on mount. */
  initialModel(): HeaderModel;
  handlers: HeaderHandlers;
  start(): void;
  stop(): void;
};

export function createHeaderDriver(
  store: typeof storeInstance,
): HeaderDriver {
  let lastModel: HeaderModel | null = null;
  let hasDocumentContent = false;
  let bootstrapWasPending = false;
  let timerId: number | null = null;
  let stopped = false;
  const unsubscribes: Array<() => void> = [];

  function currentModel(): HeaderModel {
    return derive(store.getState(), {
      allowedOutput: api.v1.script.getAllowedOutput(),
      hasDocumentContent,
      now: Date.now(),
    });
  }

  function push(model: HeaderModel): void {
    const parts = patch(lastModel, model);
    lastModel = model;
    if (parts.length > 0) {
      void api.v1.ui.updateParts(
        parts as Partial<UIPart>[] & { id: string }[],
      );
    }
  }

  async function refreshDocument(): Promise<void> {
    const ids = await api.v1.document.sectionIds();
    const has = ids.length > 0;
    if (stopped || has === hasDocumentContent) return;
    hasDocumentContent = has;
    push(currentModel());
  }

  function tick(): void {
    if (stopped) return;
    const model = currentModel();
    // A bootstrap that just settled changed the document — re-derive its label.
    if (bootstrapWasPending && !model.bootstrap.disabled) void refreshDocument();
    bootstrapWasPending = model.bootstrap.disabled;
    push(model);
  }

  function scheduleTimer(): void {
    if (stopped) return;
    const delay =
      lastModel?.widget.mode === "wait" ? TICK_WAIT_MS : TICK_IDLE_MS;
    void api.v1.timers
      .setTimeout(() => {
        if (stopped) return;
        tick();
        scheduleTimer();
      }, delay)
      .then((id: number) => {
        // The creation promise can resolve after stop(); clear it if so.
        if (stopped) void api.v1.timers.clearTimeout(id);
        else timerId = id;
      });
  }

  const handlers: HeaderHandlers = {
    onWidget: () => {
      // The click itself is what clears the harness's FlagB. In budget mode
      // that is the whole effect and there is deliberately nothing else to do.
      const mode = currentModel().widget.mode;
      if (mode === "continue") store.dispatch(uiUserPresenceConfirmed());
      else if (mode === "cancel" || mode === "wait")
        // Already calls genX.cancelAll() and marks the active request
        // cancelled, so this one dispatch is the whole global cancel.
        store.dispatch(uiRequestCancellation());
    },
    onImport: () => store.dispatch(importWizardOpened()),
    onBootstrap: () =>
      store.dispatch(
        hasDocumentContent ? bootstrapContinueRequested() : bootstrapRequested(),
      ),
  };

  return {
    initialModel: () => {
      const model = currentModel();
      lastModel = model;
      bootstrapWasPending = model.bootstrap.disabled;
      return model;
    },
    handlers,
    start: () => {
      unsubscribes.push(store.subscribeSelector(storeSignature, () => tick()));
      unsubscribes.push(
        store.subscribeSelector(
          (s) => s.runtime.historyEpoch,
          () => void refreshDocument(),
        ),
      );
      // hasDocumentContent starts false, so the first paint may briefly read
      // "Opening Scene" on a story that has content; this corrects it.
      void refreshDocument();
      scheduleTimer();
    },
    stop: () => {
      stopped = true;
      unsubscribes.forEach((u) => u());
      unsubscribes.length = 0;
      if (timerId !== null) {
        void api.v1.timers.clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}
```

- [ ] **Step 2: Wire the driver into mount.ts**

In `src/ui/mount.ts`:

1. Extend the header import:

```ts
import { buildRoot, buildHeader } from "./header/header-parts";
import { createHeaderDriver, type HeaderDriver } from "./header/header-driver";
```

`HEADER_IDS` is no longer needed here — remove it from the import or `noUnusedLocals` will fail the build.

2. Change `buildSidebarPanel` to take the driver, and replace the placeholder from Task 1:

```ts
function buildSidebarPanel(driver: HeaderDriver): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    /* ...unchanged... */
  });

  return sidebarPanel({
    id: "kse-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [
      buildRoot(buildHeader(driver.initialModel(), driver.handlers), jsxPart),
    ],
  });
}
```

3. In `start()`, create the driver before building panels and start it after registering:

```ts
  const headerDriver = createHeaderDriver(store);
  const panels: UIExtension[] = [buildSidebarPanel(headerDriver)];
```

and immediately after `await api.v1.ui.register(panels);`:

```ts
  // Only after register(): updateParts is a no-op on a part React has not
  // mounted yet. The first paint is already correct via initialModel().
  headerDriver.start();
```

- [ ] **Step 3: Drop the JSX header from StoryEngine.tsx**

In `src/ui/panels/StoryEngine.tsx`:

- Delete the `import { Header } from "./header/Header";` line.
- Delete the `<Header onOpenImport={...} />` line from the returned tree.
- Delete `importWizardOpened` from the `../../core/store` import — it is now dispatched by the driver, and leaving it imported is a `noUnusedLocals` compile error. `importWizardClosed` is still used by `<ImportWizard onClose=...>`; keep it.
- Update the file's top comment: the header is no longer part of this tree.

- [ ] **Step 4: Delete the retired JSX components**

```bash
git rm src/ui/panels/header/GenxStatus.tsx src/ui/panels/header/Header.tsx src/ui/panels/header/BootstrapButton.tsx
```

`src/ui/panels/header/` should now be empty (`countdown.ts` moved in Task 2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass. A `noUnusedLocals` error here almost certainly means a leftover import in `StoryEngine.tsx` or `mount.ts`.

- [ ] **Step 6: Build and verify live — blocking gate**

Run: `npm run build`, load `dist/NAI-story-engine.naiscript` into NovelAI, then check:

1. Header shows a token count like `4.2k out` when idle; the status row is invisible.
2. Start any generation → widget switches to `🚫 Cancel`; clicking it stops the generation.
3. Start SEGA → the status row appears below the buttons and updates.
4. Bootstrap button reads `⚡ Opening Scene` on an empty story and `⚡ Continue Scene` once there is text; it dims while a bootstrap is queued or running.
5. Undo the bootstrapped text → the label flips back within a second or two (`historyEpoch`).
6. Click the import icon → wizard opens and the icon disables; close it → the icon re-enables.
7. The header is visible on the Chat tab, inside an entity edit pane, and with the import wizard open.

- [ ] **Step 7: Verify the FlagB fix — the point of the whole change**

Burn the output budget, then idle for 240s without touching anything. The idle readout should stop climbing. Then:

- Click a **JSX** button (e.g. a Foundation card) → readout stays frozen.
- Click the **header widget** → readout resumes climbing.

`dist/jsx-click-budget-flag.tsx` is the standalone probe if you want the instrumented version. If the header click does *not* resume replenishment, stop — the design's core premise is wrong and the spec needs revisiting before Task 5.

- [ ] **Step 8: Commit**

```bash
git add -A src/ui/header src/ui/mount.ts src/ui/panels/StoryEngine.tsx src/ui/panels/header
git commit -m "feat(ui): drive the UIPart header from the store and retire the JSX header"
```

---

### Task 5: Simplify SendButton and lock the invariant

The chat composer's five-mode state machine is now redundant — and its Continue/Cancel branches were never functional in JSX anyway.

**Files:**
- Modify: `src/ui/panels/chat/SendButton.tsx`
- Modify: `src/ui/header/countdown.ts`
- Modify: `tests/ui/countdown.test.ts`

**Interfaces:**
- Consumes: `HeaderModel` machinery from Tasks 2–4 (already live).
- Produces: nothing new; `useCountdown` is removed from `countdown.ts`, leaving `remainingSeconds` and `waitLabel`.

- [ ] **Step 1: Rewrite SendButton**

Replace the entire contents of `src/ui/panels/chat/SendButton.tsx` with:

```tsx
// Chat composer send button. Two states: enabled "⚡ {label}", or disabled
// while a chat-family request is queued or active.
//
// The old five-mode machine (queue/cancel/continue/wait) is gone. All
// generation-state interaction lives in the UIPart header — a click inside the
// JSX panel cannot clear the harness's FlagB interaction flag, so a Continue
// button here was decorative.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import type { RootState } from "../../../core/store";
import { Zap } from "nai:icons/feather";

// Chat-family request types (mirrors SeBrainstormInput.isChatBusyType).
function isChatBusyType(t: string | undefined): boolean {
  return (
    t === "chat" ||
    t === "chatRefine" ||
    t === "forgeChat" ||
    t === "forgeCleanup"
  );
}

function isBusy(s: RootState): boolean {
  if (isChatBusyType(s.runtime.activeRequest?.type)) return true;
  return s.runtime.queue.some((r) => isChatBusyType(r.type));
}

export function SendButton(props: { label: string; onGenerate: () => void }) {
  const busy = useSlice(isBusy);

  return (
    <button
      disabled={busy}
      onClick={props.onGenerate}
      style={{
        flex: 1,
        padding: "6px 12px",
        cursor: busy ? "default" : "pointer",
        fontWeight: "bold",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SP.sm,
        // Mimics the NAI editor send button: transparent fill over our dark
        // backdrop, text-headings text + border.
        background: "transparent",
        color: T.textHeadings,
        border: `1px solid ${T.textHeadings}`,
        opacity: busy ? 0.4 : 1,
      }}
    >
      <Zap size={14} /> {props.label}
    </button>
  );
}
```

- [ ] **Step 2: Delete useCountdown**

In `src/ui/header/countdown.ts`, delete the entire `useCountdown` function (its last caller is gone) and update the file's top comment to:

```ts
// Budget-wait countdown helpers. Pure and unit-tested; consumed by
// header-model.ts's derive(), which is re-run by header-driver.ts's 1s timer
// while a budget wait is active.
```

Keep `waitLabel` and `remainingSeconds` exactly as they are.

- [ ] **Step 3: Invert the state-machine guard**

In `tests/ui/countdown.test.ts`, replace the whole `describe("budget-wait countdown coverage", ...)` block with:

```ts
// The generation state machine has exactly one home: header-model.ts's
// derive(). A JSX click cannot clear the harness's FlagB interaction flag, so a
// Continue or Wait button rendered in the Preact tree is dead UI — it looks
// interactive and does nothing. This guard is what stops the machine leaking
// back into JSX in a later change.
describe("generation state machine lives only in the UIPart header", () => {
  const UI_DIR = join(__dirname, "../../src/ui");

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return tsxFiles(full);
      return full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("no JSX component branches on waiting_for_budget", () => {
    const offenders = tsxFiles(UI_DIR).filter((file) =>
      readFileSync(file, "utf8").includes('"waiting_for_budget"'),
    );
    expect(offenders).toEqual([]);
  });

  it("header-model.ts owns the branch", () => {
    const src = readFileSync(join(UI_DIR, "header/header-model.ts"), "utf8");
    expect(src).toContain('"waiting_for_budget"');
    expect(src).toContain('"waiting_for_user"');
  });
});
```

Keep the existing `waitLabel` / `remainingSeconds` describe blocks and the `readdirSync` / `statSync` / `readFileSync` / `join` imports at the top of the file.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/countdown.test.ts`
Expected: PASS. If "no JSX component branches on waiting_for_budget" fails, the named file still has a stale branch — remove it rather than weakening the guard.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Verify live**

Run `npm run build`, load into NovelAI, open the Chat tab and confirm: sending a message disables the send button for the duration and re-enables when the reply lands; cancelling from the **header** re-enables it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/chat/SendButton.tsx src/ui/header/countdown.ts tests/ui/countdown.test.ts
git commit -m "refactor(ui): reduce SendButton to send/disabled, guard the state machine's home"
```

---

### Task 6: Changelog and documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the changelog entries**

`project.yaml` stays at `0.14.0` — it was already bumped on this branch. Add these bullets to the existing `## [0.14.0]` section, under `### Fixed` (create the heading if it isn't there, after `### Changed`):

```markdown
- **Generation can be un-stalled again.** NovelAI's script harness pauses token replenishment when it can't see recent user activity, and only resumes on a click it recognises — which a click inside the JSX panel isn't. The Continue button had become decorative, so a paused generation stayed paused. Story Engine's header is now built from NovelAI's own UI components and sits above the panel, where its clicks register: one press on the status widget resumes a stalled generation.
```

And under `### Changed`:

```markdown
- **One place to drive generation.** The header is now always visible — on the Chat tab, in an entity's edit pane, and over the Import wizard — and shows remaining output budget when idle, a Cancel control while generating, Continue when a generation is waiting on you, and a live countdown while it waits on budget. SEGA progress moved to its own line beneath. Every other generate button simply dims while its own work is in flight, so there's no longer a second, half-working copy of these controls in the chat composer.
```

- [ ] **Step 2: Record the updateParts exception in CLAUDE.md**

The SUI teardown left `src/` with zero `updateParts` calls. This change reintroduces exactly one caller by design, and that needs recording or it reads as drift. In `CLAUDE.md`, under the **UI (`src/ui/`)** section, replace the bullet beginning "Non-storageKey UI mutations use `api.v1.ui.updateParts()`" with:

```markdown
- The UI is Preact/JSX and re-renders from the store — never `updateParts`. **One deliberate exception:** `src/ui/header/header-driver.ts`. The header is built from UIParts because a click inside a `part.jsx()` does not clear the harness's user-interaction flag, so budget-stalled generation can only be resumed from a real `part.button()`. That driver is the only permitted `updateParts` caller in `src/`; it holds no logic beyond diffing `header-model.ts`'s `derive()` output and pushing what changed.
```

- [ ] **Step 3: Format, typecheck, test, build**

Run: `npm run format && npx tsc --noEmit && npm test && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: record the UIPart header and its updateParts exception"
```

---

## Post-Implementation Verification

Run through the whole flow once on a fresh story:

1. Header renders above the tab bar with a budget readout.
2. Bootstrap → Opening Scene generates; label becomes Continue Scene; undo flips it back.
3. Import icon opens the wizard and disables while open.
4. A chat send disables the composer button; the header shows Cancel; cancelling from the header re-enables the composer.
5. SEGA shows progress on the header's second row.
6. Budget exhaustion shows a ticking countdown, then Continue; pressing Continue actually resumes.
7. Chat list scrolls internally with the composer pinned — the Task 1 contract still holds after everything else landed.
