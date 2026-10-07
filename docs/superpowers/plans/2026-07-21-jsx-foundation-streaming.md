# JSX Foundation Card Live Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation cards in the JSX panel show live per-token generation text, via the effect-free stream-buffer, without breaking SUI's streaming (dual-write).

**Architecture:** The shared `foundationHandler` dual-writes: keep the SUI `updateParts` sink, add a `stream-buffer` write keyed `foundation:<field>`. The JSX `FieldCard` reads it via `useStream`, falling back to the committed store value when the buffer clears on completion. Mirrors the working chat streamer.

**Tech Stack:** TypeScript (strict), nai-store generation handlers, effect-free `stream-buffer`, Preact-style JSX (`useStream`/`useSlice` from bridge), vitest, nibs build.

## Global Constraints

- **Dual-write, non-destructive:** keep the existing SUI sinks (`api.v1.ui.updateParts`); only ADD stream-buffer writes. Do not remove SUI code.
- Buffer key is `` `foundation:${field}` `` where `field` is the `FoundationTarget.field` (shape/intent/contract/attg/style/worldState). The JSX card uses the descriptor id (shape/intent/contract/attg/style), which matches.
- No new store slices/reducers; no prompt changes.
- Per-token streaming must NOT dispatch to the store (that wedges the JSX render flush) — it writes to the stream-buffer only. Commit to store happens once, on completion.
- `useStream` returns a primitive (`string | undefined`); no `useSlice` stability concern.
- Strict TypeScript (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`); `npx tsc --noEmit` exit 0. `escapeForMarkdown` stays imported (still used by the SUI path).
- Format before commit: `npx prettier -w <files>`. Do NOT bump `project.yaml` version or touch CHANGELOG.
- Typecheck gate: `npx tsc --noEmit`. Logic tests: `npx vitest run <file>` / `npm test`.

## File Structure

- Modify `src/core/store/effects/handlers/foundation.ts` — dual-write to stream-buffer.
- Create `tests/core/store/effects/handlers/foundation.test.ts` — handler streaming/completion tests.
- Modify `src/ui-jsx/panels/foundation/FieldCard.tsx` — read the live buffer via `useStream`.

---

### Task 1: `foundation.ts` handler dual-write (TDD)

**Files:**

- Modify: `src/core/store/effects/handlers/foundation.ts`
- Test: `tests/core/store/effects/handlers/foundation.test.ts`

**Interfaces:**

- Consumes: `writeStream`, `clearStream`, `readStream` from `../../stream-buffer` (handler imports the first two; the test imports `readStream`/`clearStream`).
- Produces: no signature change — `foundationHandler.streaming` now also writes `ctx.accumulatedText` to `` `foundation:${field}` ``; `foundationHandler.completion` clears that key in a `finally`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/store/effects/handlers/foundation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { foundationHandler } from "../../../../../src/core/store/effects/handlers/foundation";
import {
  readStream,
  clearStream,
} from "../../../../../src/core/store/stream-buffer";
import type { CompletionContext } from "../../../../../src/core/store/effects/generation-handlers";
import type { GenerationStrategy } from "../../../../../src/core/store/types";

type FoundationTarget = Extract<
  GenerationStrategy["target"],
  { type: "foundation" }
>;

function makeCtx(
  over: Partial<CompletionContext<FoundationTarget>> = {},
): CompletionContext<FoundationTarget> {
  return {
    target: { type: "foundation", field: "intent" },
    getState: vi.fn(),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<FoundationTarget>;
}

describe("foundationHandler.streaming", () => {
  it("writes accumulatedText to the foundation stream buffer, no dispatch", () => {
    clearStream("foundation:intent");
    const ctx = makeCtx({ accumulatedText: "Explore themes of" });
    foundationHandler.streaming(ctx, "of");
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("foundation:intent")).toBe("Explore themes of");
    clearStream("foundation:intent");
  });
});

describe("foundationHandler.completion", () => {
  it("dispatches intentUpdated and clears the buffer on success", async () => {
    clearStream("foundation:intent");
    const streamCtx = makeCtx({ accumulatedText: "partial" });
    foundationHandler.streaming(streamCtx, "partial");
    expect(readStream("foundation:intent")).toBe("partial");
    const ctx = makeCtx({ accumulatedText: "Explore inherited trauma" });
    await foundationHandler.completion(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith({
      type: "foundation/intentUpdated",
      payload: { intent: "Explore inherited trauma" },
    });
    expect(readStream("foundation:intent")).toBeUndefined();
  });

  it("clears the buffer and does not dispatch when generation failed", async () => {
    clearStream("foundation:intent");
    foundationHandler.streaming(
      makeCtx({ accumulatedText: "partial" }),
      "partial",
    );
    const ctx = makeCtx({
      accumulatedText: "partial",
      generationSucceeded: false,
    });
    await foundationHandler.completion(ctx);
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(readStream("foundation:intent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store/effects/handlers/foundation.test.ts`
Expected: FAIL — `readStream("foundation:intent")` is `undefined` after `streaming` (the handler doesn't write the buffer yet), and the completion test finds the buffer never populated / not cleared.

- [ ] **Step 3: Add the stream-buffer import**

In `src/core/store/effects/handlers/foundation.ts`, after the existing imports, add:

```ts
import { writeStream, clearStream } from "../../stream-buffer";
```

- [ ] **Step 4: Dual-write in `streaming`**

Replace the `streaming` method:

```ts
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    const viewId = VIEW_IDS[ctx.target.field];
    api.v1.ui.updateParts([
      { id: viewId, text: escapeForMarkdown(ctx.accumulatedText) },
    ]);
  },
```

with (adds the raw JSX buffer write alongside the SUI escaped `updateParts`):

```ts
  streaming(ctx: StreamingContext<FoundationTarget>, _newText: string): void {
    const viewId = VIEW_IDS[ctx.target.field];
    api.v1.ui.updateParts([
      { id: viewId, text: escapeForMarkdown(ctx.accumulatedText) },
    ]);
    // JSX reads the raw accumulated text from the effect-free buffer; the SUI
    // path above renders the markdown-escaped copy. Per-token, no store dispatch.
    writeStream(`foundation:${ctx.target.field}`, ctx.accumulatedText);
  },
```

- [ ] **Step 5: Clear the buffer in `completion` (finally)**

Replace the `completion` method:

```ts
  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();

    switch (ctx.target.field) {
      case "shape": {
        const existingName = ctx.getState().foundation.shape?.name ?? "";
        const shape = parseShape(text, existingName);
        ctx.dispatch(shapeUpdated({ shape }));
        break;
      }
      case "intent": {
        ctx.dispatch(intentUpdated({ intent: text }));
        break;
      }
      case "worldState": {
        ctx.dispatch(worldStateUpdated({ worldState: text }));
        break;
      }
      case "contract": {
        const contract = parseContract(text);
        ctx.dispatch(contractUpdated({ contract }));
        break;
      }
      case "attg": {
        ctx.dispatch(attgUpdated({ attg: text }));
        if (ctx.getState().foundation.attgSyncEnabled) {
          await api.v1.memory.set(text.trim());
        }
        break;
      }
      case "style": {
        ctx.dispatch(styleUpdated({ style: text }));
        if (ctx.getState().foundation.styleSyncEnabled) {
          await api.v1.an.set(text.trim());
        }
        break;
      }
    }
  },
```

with (wraps the body in try/finally so the buffer is always cleared — even on the
early return or a failure — letting the JSX card fall back to the committed store
value):

```ts
  async completion(ctx: CompletionContext<FoundationTarget>): Promise<void> {
    const field = ctx.target.field;
    try {
      if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

      const text = stripThinkingTags(ctx.accumulatedText).trim();

      switch (field) {
        case "shape": {
          const existingName = ctx.getState().foundation.shape?.name ?? "";
          const shape = parseShape(text, existingName);
          ctx.dispatch(shapeUpdated({ shape }));
          break;
        }
        case "intent": {
          ctx.dispatch(intentUpdated({ intent: text }));
          break;
        }
        case "worldState": {
          ctx.dispatch(worldStateUpdated({ worldState: text }));
          break;
        }
        case "contract": {
          const contract = parseContract(text);
          ctx.dispatch(contractUpdated({ contract }));
          break;
        }
        case "attg": {
          ctx.dispatch(attgUpdated({ attg: text }));
          if (ctx.getState().foundation.attgSyncEnabled) {
            await api.v1.memory.set(text.trim());
          }
          break;
        }
        case "style": {
          ctx.dispatch(styleUpdated({ style: text }));
          if (ctx.getState().foundation.styleSyncEnabled) {
            await api.v1.an.set(text.trim());
          }
          break;
        }
      }
    } finally {
      clearStream(`foundation:${field}`);
    }
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/store/effects/handlers/foundation.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: PASS — all suites including the new foundation handler test.

- [ ] **Step 8: Format + commit**

```bash
npx prettier -w src/core/store/effects/handlers/foundation.ts tests/core/store/effects/handlers/foundation.test.ts
git add src/core/store/effects/handlers/foundation.ts tests/core/store/effects/handlers/foundation.test.ts
git commit -m "feat(jsx): foundation handler dual-writes streaming to the JSX buffer"
```

---

### Task 2: `FieldCard.tsx` — read the live stream buffer

**Files:**

- Modify: `src/ui-jsx/panels/foundation/FieldCard.tsx`

**Interfaces:**

- Consumes: `useStream` from `../../bridge`; the `foundation:<id>` buffer written by Task 1.

> Verified by `npx tsc --noEmit` + `npm run build`; then the final live pass (CONTROLLER + user). No component render harness — the implementer stops after build.

- [ ] **Step 1: Import `useStream`**

In `src/ui-jsx/panels/foundation/FieldCard.tsx`, change the bridge import:

```tsx
import { useSlice } from "../../bridge";
```

to:

```tsx
import { useSlice, useStream } from "../../bridge";
```

- [ ] **Step 2: Read the live buffer, fall back to the store value**

Replace:

```tsx
const value = useSlice((s) => d.display(s));
```

with:

```tsx
// While generating, show the live per-token text from the effect-free buffer;
// on completion the handler clears it and we fall back to the committed
// (formatted) store value. Mirrors the chat bubble.
const storeValue = useSlice((s) => d.display(s));
const live = useStream(`foundation:${d.id}`);
const value = live ?? storeValue;
```

(The render already uses `value` — no further change.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors. (If it fails with a `ModuleKind` / `@rollup/plugin-typescript` error, that is the known typescript-pin environment issue — report it as a concern, do not modify package.json.)

- [ ] **Step 5: Manual harness verification** — CONTROLLER + USER ONLY, not the implementer.

(For reference — the controller runs this with the user. The implementer stops after Step 4.) In NovelAI, Story Engine (JSX) tab: generate an empty Foundation field (e.g. click the Intent zap while Intent is empty) and confirm the text **streams in token-by-token** in the card, and the committed value remains after completion. Optionally run SEGA and confirm foundation fields stream. Confirm the SUI panel still streams (dual-write intact).

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/foundation/FieldCard.tsx
git add src/ui-jsx/panels/foundation/FieldCard.tsx
git commit -m "feat(jsx): Foundation card shows live streaming via useStream"
```

---

## Self-Review Notes

- **Spec coverage:** handler dual-write (`writeStream` in streaming, `clearStream` in a `finally`) + test (Task 1); FieldCard `useStream ?? storeValue` (Task 2). Dual-write keeps SUI; buffer key `foundation:<field>` consistent; no store/prompt changes; commit-to-store-once preserved.
- **Type consistency:** buffer key `` `foundation:${field}` `` (handler) matches `` `foundation:${d.id}` `` (card) — `FoundationTarget.field` and the descriptor `id` share the same string values (shape/intent/contract/attg/style). `useStream(key): string | undefined` consumed correctly (`live ?? storeValue`).
- **Placeholders:** none — every step has complete code. The `escapeForMarkdown` import is retained (SUI path), satisfying `noUnusedLocals`.
