# JSX Entity Pane Summary Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Summary generate button in the JSX entity edit pane — tokens stream live into the summary textarea, and on completion the generated text stages into the editable draft (Back discards, Save commits).

**Architecture:** `entitySummaryHandler` dual-writes to the `stream-buffer` key `entity-summary:<id>` (per-token + final on completion), keeping the SUI sinks and NOT committing to the store when the pane is open. The pane reads it via `useStream` while its request is pending, then a `genRef`-guarded effect stages the final into the draft. A new `isRequestActive` helper drives per-button pending.

**Tech Stack:** TypeScript (strict), nai-store generation handlers, effect-free `stream-buffer`, Preact-style JSX (`useStream`/`useSlice`/`useRef`/`useEffect`), vitest, nibs build.

## Global Constraints

- **Dual-write, non-destructive:** keep the existing SUI sinks (`storyStorage.set(EDIT_PANE_CONTENT, …)`); only ADD `writeStream`. On pane-open completion do NOT commit to the store (Back must discard) — the buffer carries the final into the draft.
- Only `entitySummaryHandler` changes in `summary.ts`; `entitySummaryBindHandler` / `threadSummaryHandler` are untouched.
- Buffer key `` `entity-summary:${entityId}` ``; request id `` `se-entity-summary-${entityId}` `` — must match between handler, helper, and pane.
- No new store slices/reducers; no prompt changes. Content/Keys pane buttons stay disabled (next slice).
- Per-token streaming must NOT dispatch to the store; the store commit happens (background case only) once on completion.
- `useState`/`useEffect`/`useRef`/`h`/`Fragment` are NAI-runtime globals — do NOT import (`useSlice`/`useStream` from bridge; `useDraftField` from hooks). Hooks precede the `if (!entity) return null` guard.
- `useStream`/`isRequestActive` return primitives — no `useSlice` loop risk.
- Strict TypeScript (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`); `npx tsc --noEmit` exit 0.
- Format before commit: `npx prettier -w <files>`. Do NOT bump `project.yaml` version or touch CHANGELOG.
- Typecheck gate: `npx tsc --noEmit`. Logic tests: `npx vitest run <file>` / `npm test`.

## File Structure

- Modify `src/core/store/effects/handlers/summary.ts` — `entitySummaryHandler` dual-write.
- Create `tests/core/store/effects/handlers/summary.test.ts` — handler tests.
- Modify `src/ui-jsx/panels/world/world-select.ts` — `isRequestActive` + DRY `entityPending`.
- Modify `tests/ui-jsx/world-select.test.ts` — `isRequestActive` tests.
- Modify `src/ui-jsx/panels/world/EntityEditPane.tsx` — enable the Summary button.

---

### Task 1: `summary.ts` — `entitySummaryHandler` dual-write (TDD)

**Files:**
- Modify: `src/core/store/effects/handlers/summary.ts`
- Test: `tests/core/store/effects/handlers/summary.test.ts`

**Interfaces:**
- Consumes: `writeStream` from `../../stream-buffer` (handler); `readStream`/`clearStream` (test).
- Produces: no signature change — `entitySummaryHandler.streaming` also writes `ctx.accumulatedText` to `entity-summary:<entityId>`; `completion` writes the trimmed final to the same key (in addition to the existing storyStorage-stage / store-dispatch branch).

- [ ] **Step 1: Write the failing test**

Create `tests/core/store/effects/handlers/summary.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { entitySummaryHandler } from "../../../../../src/core/store/effects/handlers/summary";
import {
  readStream,
  clearStream,
} from "../../../../../src/core/store/stream-buffer";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type { GenerationStrategy } from "../../../../../src/core/store/types";

type EntitySummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "entitySummary" }
>;

function makeCtx(
  over: Partial<CompletionContext<EntitySummaryTarget>> = {},
): CompletionContext<EntitySummaryTarget> {
  return {
    target: { type: "entitySummary", entityId: "e1" },
    getState: () => ({ ui: { activeEditId: null } }),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<EntitySummaryTarget>;
}

describe("entitySummaryHandler.streaming", () => {
  it("writes accumulatedText to the entity-summary buffer, no dispatch", () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({ accumulatedText: "A sterile lab" });
    entitySummaryHandler.streaming(ctx, "lab");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("entity-summary:e1")).toBe("A sterile lab");
    clearStream("entity-summary:e1");
  });
});

describe("entitySummaryHandler.completion", () => {
  it("pane CLOSED: writes trimmed final to the buffer AND dispatches entitySummaryUpdated", async () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({
      accumulatedText: "  A sterile research lab  ",
      getState: () => ({ ui: { activeEditId: null } }) as never,
    });
    await entitySummaryHandler.completion(ctx);
    expect(readStream("entity-summary:e1")).toBe("A sterile research lab");
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "world/entitySummaryUpdated",
      payload: { entityId: "e1", summary: "A sterile research lab" },
    });
    clearStream("entity-summary:e1");
  });

  it("pane OPEN: writes trimmed final to the buffer AND does NOT dispatch", async () => {
    clearStream("entity-summary:e1");
    const ctx = makeCtx({
      accumulatedText: "  A sterile research lab  ",
      getState: () => ({ ui: { activeEditId: "e1" } }) as never,
    });
    await entitySummaryHandler.completion(ctx);
    expect(readStream("entity-summary:e1")).toBe("A sterile research lab");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    clearStream("entity-summary:e1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store/effects/handlers/summary.test.ts`
Expected: FAIL — `readStream("entity-summary:e1")` is `undefined` (the handler doesn't write the buffer yet).

- [ ] **Step 3: Add the stream-buffer import**

In `src/core/store/effects/handlers/summary.ts`, after the existing imports (below line 8), add:

```ts
import { writeStream } from "../../stream-buffer";
```

- [ ] **Step 4: Dual-write in `entitySummaryHandler`**

Replace the `entitySummaryHandler` object (lines 23-50) with:

```ts
export const entitySummaryHandler: GenerationHandlers<EntitySummaryTarget> = {
  streaming(
    ctx: StreamingContext<EntitySummaryTarget>,
    _newText: string,
  ): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
    // JSX pane reads the live text from the effect-free buffer; per-token, no
    // store dispatch. The pane stages the final into its editable draft.
    writeStream(`entity-summary:${ctx.target.entityId}`, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<EntitySummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      const trimmed = ctx.accumulatedText.trim();
      // Carry the final into the buffer for the open JSX pane to stage into its
      // draft (the pane owns clearing). NOT committed to the store when the pane
      // is open, so Back discards; Save commits.
      writeStream(`entity-summary:${ctx.target.entityId}`, trimmed);
      const editPaneOpen =
        ctx.getState().ui.activeEditId === ctx.target.entityId;
      if (editPaneOpen) {
        // Edit pane is open: stage in storyStorage for the user to review and save.
        await api.v1.storyStorage.set(EDIT_PANE_CONTENT, trimmed);
      } else {
        // Background generation: save directly to Redux.
        ctx.dispatch(
          entitySummaryUpdated({
            entityId: ctx.target.entityId,
            summary: trimmed,
          }),
        );
      }
    }
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/store/effects/handlers/summary.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: PASS — all suites including the new summary handler test.

- [ ] **Step 7: Format + commit**

```bash
npx prettier -w src/core/store/effects/handlers/summary.ts tests/core/store/effects/handlers/summary.test.ts
git add src/core/store/effects/handlers/summary.ts tests/core/store/effects/handlers/summary.test.ts
git commit -m "feat(jsx): entity summary handler dual-writes streaming to the JSX buffer"
```

---

### Task 2: `world-select.ts` — `isRequestActive` helper (TDD)

**Files:**
- Modify: `src/ui-jsx/panels/world/world-select.ts`
- Test: `tests/ui-jsx/world-select.test.ts` (extend)

**Interfaces:**
- Produces: `isRequestActive(runtime: RootState["runtime"], requestId: string): boolean`. `entityPending` is refactored onto it (behavior-preserving).

- [ ] **Step 1: Add the failing test**

In `tests/ui-jsx/world-select.test.ts`, add the `isRequestActive` import to the existing import from `world-select` (alongside `selectWorldBody`, `entityPending`, etc.), then append this describe block at the end of the file:

```ts
describe("isRequestActive", () => {
  const rt = (over: Partial<RootState["runtime"]>): RootState["runtime"] =>
    ({
      activeRequest: null,
      queue: [],
      sega: { activeRequestIds: [] },
      ...over,
    }) as unknown as RootState["runtime"];

  it("true when the id is the active request / queued / SEGA-active", () => {
    expect(
      isRequestActive(rt({ activeRequest: { id: "req-1" } as never }), "req-1"),
    ).toBe(true);
    expect(
      isRequestActive(rt({ queue: [{ id: "req-1" } as never] }), "req-1"),
    ).toBe(true);
    expect(
      isRequestActive(rt({ sega: { activeRequestIds: ["req-1"] } as never }), "req-1"),
    ).toBe(true);
  });

  it("false when the id matches nothing", () => {
    expect(
      isRequestActive(rt({ queue: [{ id: "other" } as never] }), "req-1"),
    ).toBe(false);
  });
});
```

(If the file does not already import `RootState`, add `import type { RootState } from "../../src/core/store";` — check the existing imports first; the `entityPending` block already constructs a `RootState["runtime"]`, so the type is likely imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: FAIL — `isRequestActive` is not exported.

- [ ] **Step 3: Add `isRequestActive` and refactor `entityPending`**

In `src/ui-jsx/panels/world/world-select.ts`, replace the `entityPending` function (lines 36-47) with:

```ts
/** True while a specific request id is active, queued, or SEGA-active. */
export function isRequestActive(
  runtime: RootState["runtime"],
  requestId: string,
): boolean {
  return (
    runtime.activeRequest?.id === requestId ||
    runtime.queue.some((q) => q.id === requestId) ||
    runtime.sega.activeRequestIds.includes(requestId)
  );
}

/** True while any of the entity's requests is active, queued, or SEGA-active. */
export function entityPending(
  runtime: RootState["runtime"],
  entityId: string,
): boolean {
  return entityRequestIds(entityId).some((id) => isRequestActive(runtime, id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-jsx/world-select.test.ts`
Expected: PASS — the new `isRequestActive` cases and the existing `entityPending`/`selectWorldBody`/`entityBorderKind` cases.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git add src/ui-jsx/panels/world/world-select.ts tests/ui-jsx/world-select.test.ts
git commit -m "feat(jsx): isRequestActive helper (single-id pending)"
```

---

### Task 3: `EntityEditPane.tsx` — enable the Summary generate button

**Files:**
- Modify: `src/ui-jsx/panels/world/EntityEditPane.tsx`

**Interfaces:**
- Consumes: `useStream` (bridge); `uiEntitySummaryGenerationRequested` (core/store barrel); `clearStream` (core/store/stream-buffer); `isRequestActive` (Task 2).

> Verified by `npx tsc --noEmit` + `npm run build`; then the final live pass (CONTROLLER + user). The implementer stops after build.

- [ ] **Step 1: Update imports**

In `src/ui-jsx/panels/world/EntityEditPane.tsx`:

Change line 8:

```tsx
import { useSlice } from "../../bridge";
```

to:

```tsx
import { useSlice, useStream } from "../../bridge";
```

Add `uiEntitySummaryGenerationRequested` to the `../../../core/store` import list (after `uiEditableDeactivate`):

```tsx
import {
  store,
  entityEdited,
  entityCategoryChanged,
  entityLorebookEntryBound,
  entitySummaryUpdated,
  entityDeleted,
  uiEditableDeactivate,
  uiEntitySummaryGenerationRequested,
} from "../../../core/store";
```

Add two imports after the `./entity-edit` import block (after line 30):

```tsx
import { clearStream } from "../../../core/store/stream-buffer";
import { isRequestActive } from "./world-select";
```

- [ ] **Step 2: Add the summary-streaming hooks**

In `EntityEditPane`, immediately after the seed `useEffect` (which ends `}, []);` at line 138) and BEFORE `if (!entity) return null;` (line 140), insert:

```tsx
  const summaryReqId = `se-entity-summary-${entityId}`;
  const summaryKey = `entity-summary:${entityId}`;
  const summaryPending = useSlice((s) =>
    isRequestActive(s.runtime, summaryReqId),
  );
  const summaryLive = useStream(summaryKey);
  const genRef = useRef(false);

  // Wipe a stale background buffer on open (so the display shows the seeded
  // draft, not a leftover from a card-regen) and clean up on unmount.
  useEffect(() => {
    clearStream(summaryKey);
    return () => clearStream(summaryKey);
  }, []);

  // Stage the final streamed summary into the editable draft when a
  // pane-triggered generation finishes. genRef guards against mount/stale
  // auto-transfer; the [pending, live] deps make it order-independent (fires
  // once both the request has cleared and the final text is in the buffer).
  useEffect(() => {
    if (genRef.current && !summaryPending && summaryLive !== undefined) {
      summary.setValue(summaryLive);
      clearStream(summaryKey);
      genRef.current = false;
    }
  }, [summaryPending, summaryLive]);
```

- [ ] **Step 3: Add the `onGenerateSummary` handler**

After the `onCategory` handler (which ends `};` at line 147), insert:

```tsx
  const onGenerateSummary = () => {
    if (summaryPending) return;
    genRef.current = true;
    clearStream(summaryKey);
    store.dispatch(
      uiEntitySummaryGenerationRequested({ entityId, requestId: summaryReqId }),
    );
  };
```

- [ ] **Step 4: Enable the Summary button + stream into the textarea**

Replace the Summary section (lines 264-277):

```tsx
      {/* Summary */}
      <div style={sectionRow}>
        <span style={sectionLabel}>Summary</span>
        <button title="Generate (coming soon)" disabled style={disabledZap}>
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="Brief description of this entity…"
        rows={4}
        value={summary.value}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, resize: "vertical" }}
      />
```

with:

```tsx
      {/* Summary */}
      <div style={sectionRow}>
        <span style={sectionLabel}>Summary</span>
        <button
          title={summaryPending ? "Generating…" : "Generate summary"}
          onClick={onGenerateSummary}
          disabled={summaryPending}
          style={{
            background: "none",
            border: "none",
            cursor: summaryPending ? "default" : "pointer",
            opacity: summaryPending ? 0.4 : 1,
          }}
        >
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="Brief description of this entity…"
        rows={4}
        disabled={summaryPending}
        value={summaryLive ?? summary.value}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, resize: "vertical" }}
      />
```

(The Content and Keys generate buttons stay `disabled` — unchanged.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors. (If it fails with a `ModuleKind` / `@rollup/plugin-typescript` error, that is the known typescript-pin environment issue — report it as a concern, do not modify package.json.)

- [ ] **Step 6: Manual harness verification** — CONTROLLER + USER ONLY, not the implementer.

(For reference — the controller runs this with the user. The implementer stops after Step 5.) In NovelAI, Story Engine (JSX) tab: open an entity's edit pane, click the Summary zap → the summary textarea shows tokens **streaming in** (disabled during), and on completion the text lands in the **editable** textarea; edit it and Save → the card summary updates. Confirm Back before Save discards the generated summary (the store wasn't committed). Content/Keys buttons remain disabled.

- [ ] **Step 7: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityEditPane.tsx
git add src/ui-jsx/panels/world/EntityEditPane.tsx
git commit -m "feat(jsx): entity pane Summary generation with live streaming"
```

---

## Self-Review Notes

- **Spec coverage:** handler dual-write (streaming + final-on-completion, no store commit when pane-open) + test (Task 1); `isRequestActive` + DRY `entityPending` + test (Task 2); pane Summary button enable + streaming display + `genRef`-guarded transfer + mount/unmount clear (Task 3). Content/Keys stay disabled; SUI sinks kept.
- **Type consistency:** buffer key `entity-summary:${entityId}` and request id `se-entity-summary-${entityId}` identical across handler (Task 1) and pane (Task 3); `isRequestActive(runtime, requestId)` defined in Task 2 and consumed in Task 3; the handler's `entitySummaryUpdated` action type `world/entitySummaryUpdated` asserted in the Task-1 test.
- **Placeholders:** none — every step has complete code. Hooks are placed before the early return; `useRef`/`useEffect` are runtime globals (not imported).
