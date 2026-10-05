# JSX Entity Pane Content + Keys Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the entity edit pane's Content + Keys generate buttons — promote a draft if needed, stream generation into the editable draft, commit to the lorebook — via a shared `useGenField` hook (Summary refactored onto it too).

**Architecture:** `lorebookContentHandler`/`lorebookKeysHandler` dual-write generation to the `stream-buffer` (`lb-content:<entryId>` / `lb-keys:<entryId>`), keeping SUI sinks. A shared `useGenField` hook in `EntityEditPane` unifies pending (`isRequestActive`) / live (`useStream`) / `genRef`-guarded buffer→draft transfer. Content/Keys buttons promote (`ensureLiveEntryId`) → select (`uiLorebookEntrySelected`) → dispatch.

**Tech Stack:** TypeScript (strict), nai-store generation handlers, effect-free `stream-buffer`, Preact-style JSX (`useStream`/`useSlice`/`useRef`/`useEffect`), vitest, nibs build.

## Global Constraints

- **Dual-write, non-destructive:** keep the existing SUI sinks (storyStorage draft slots, `updateEntry`); only ADD `writeStream`/`clearStream`.
- Per-token streaming must NOT dispatch to the store. Content commits to the lorebook on completion (existing); keys likewise (existing).
- Buffer keys `` `lb-content:${entryId}` `` / `` `lb-keys:${entryId}` ``; request ids `` `lb-item-${entryId}-content` `` / `` `lb-item-${entryId}-keys` `` (= `IDS.LOREBOOK.entry(entryId).CONTENT_REQ/KEYS_REQ`) — must match handler ↔ pane.
- Content streaming stays gated by `selectedEntryId === entryId`; keys streaming stays a no-op. The pane must dispatch `uiLorebookEntrySelected({ entryId })` before a content/keys request (the request effects return early otherwise), and `uiLorebookEntrySelected(null)` on unmount.
- No new store slices/reducers; no prompt changes.
- `useState`/`useEffect`/`useRef`/`h`/`Fragment` are NAI-runtime globals — do NOT import. `useGenField` is a custom hook (module-level, name starts with `use`); its three call sites are unconditional and precede the `if (!entity) return null` guard.
- `useStream`/`isRequestActive` return primitives — no `useSlice` loop risk. `useStream("")` (draft with no entry) is harmless.
- Strict TypeScript (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`); `npx tsc --noEmit` exit 0.
- Format before commit: `npx prettier -w <files>`. Do NOT bump `project.yaml` version or touch CHANGELOG.
- Typecheck gate: `npx tsc --noEmit`. Logic tests: `npx vitest run <file>` / `npm test`.

## File Structure

- Modify `src/core/store/effects/handlers/lorebook.ts` — content + keys dual-write (Tasks 1, 2).
- Modify `tests/core/store/effects/handlers/lorebook.test.ts` — handler tests (Tasks 1, 2).
- Modify `src/ui-jsx/panels/world/EntityEditPane.tsx` — `useGenField` + Summary refactor (Task 3); Content + Keys (Task 4).

---

### Task 1: `lorebookContentHandler` dual-write (TDD)

**Files:**
- Modify: `src/core/store/effects/handlers/lorebook.ts`
- Test: `tests/core/store/effects/handlers/lorebook.test.ts`

**Interfaces:**
- Consumes: `writeStream`, `clearStream` from `../../stream-buffer` (handler); `readStream`, `clearStream` (test).
- Produces: `lorebookContentHandler.streaming` also writes `prefill+accumulated` to `lb-content:<entryId>`; `completion` writes `fullContent` (success) / clears (failure).

- [ ] **Step 1: Write the failing test**

In `tests/core/store/effects/handlers/lorebook.test.ts`, add these imports at the top (alongside the existing pure-function import):

```ts
import {
  lorebookContentHandler,
  lorebookKeysHandler,
} from "../../../../../src/core/store/effects/handlers/lorebook";
import {
  readStream,
  clearStream,
} from "../../../../../src/core/store/stream-buffer";
import type {
  CompletionContext,
  StreamingContext,
} from "../../../../../src/core/store/effects/generation-handlers";
import { vi } from "vitest";
```

Append this describe block at the end of the file:

```ts
describe("lorebookContentHandler dual-write", () => {
  const streamCtx = (entryId: string, accumulatedText: string) =>
    ({
      target: { type: "lorebookContent", entryId },
      getState: () => ({ ui: { lorebook: { selectedEntryId: entryId } } }),
      dispatch: vi.fn(),
      accumulatedText,
    }) as unknown as StreamingContext<never>;

  const completeCtx = (
    entryId: string,
    over: Record<string, unknown> = {},
  ) =>
    ({
      target: { type: "lorebookContent", entryId },
      getState: () => ({ ui: { lorebook: { selectedEntryId: entryId } } }),
      dispatch: vi.fn(),
      accumulatedText: "final body",
      generationSucceeded: true,
      ...over,
    }) as unknown as CompletionContext<never>;

  it("streaming writes accumulated content to the buffer (when selected)", () => {
    clearStream("lb-content:c1");
    lorebookContentHandler.streaming(streamCtx("c1", "streamed body"), "");
    expect(readStream("lb-content:c1")).toContain("streamed body");
    clearStream("lb-content:c1");
  });

  it("completion writes the full content to the buffer on success", async () => {
    clearStream("lb-content:c1");
    await lorebookContentHandler.completion(completeCtx("c1"));
    const v = readStream("lb-content:c1");
    expect(v).toBeDefined();
    expect(v).toContain("final body");
    clearStream("lb-content:c1");
  });

  it("completion clears the buffer on failure", async () => {
    clearStream("lb-content:c1");
    // seed a partial as if streaming had run
    lorebookContentHandler.streaming(streamCtx("c1", "partial"), "");
    await lorebookContentHandler.completion(
      completeCtx("c1", { generationSucceeded: false }),
    );
    expect(readStream("lb-content:c1")).toBeUndefined();
    clearStream("lb-content:c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store/effects/handlers/lorebook.test.ts`
Expected: FAIL — `readStream("lb-content:c1")` is `undefined` (the handler doesn't write the buffer yet).

- [ ] **Step 3: Add the stream-buffer import**

In `src/core/store/effects/handlers/lorebook.ts`, after the existing imports, add:

```ts
import { writeStream, clearStream } from "../../stream-buffer";
```

- [ ] **Step 4: Dual-write in `lorebookContentHandler`**

In `streaming`, after the existing line
`api.v1.storyStorage.set(IDS.LOREBOOK.CONTENT_DRAFT_RAW, displayContent);`, add:

```ts
      writeStream(`lb-content:${ctx.target.entryId}`, displayContent);
```

In `completion`, after the existing line `const fullContent = prefill + cleaned;`, add:

```ts
        // JSX pane reads the editable (pre-erato) content from the buffer.
        writeStream(`lb-content:${entryId}`, fullContent);
```

In the same `completion`, inside the `else` branch (the `// Cancelled or failed` block, after the `if (entryId === currentSelected) { … }`), add:

```ts
        clearStream(`lb-content:${entryId}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/store/effects/handlers/lorebook.test.ts`
Expected: PASS (the three new content cases + all existing pure-function cases).

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Format + commit**

```bash
npx prettier -w src/core/store/effects/handlers/lorebook.ts tests/core/store/effects/handlers/lorebook.test.ts
git add src/core/store/effects/handlers/lorebook.ts tests/core/store/effects/handlers/lorebook.test.ts
git commit -m "feat(jsx): lorebook content handler dual-writes streaming to the JSX buffer"
```

---

### Task 2: `lorebookKeysHandler` dual-write (TDD)

**Files:**
- Modify: `src/core/store/effects/handlers/lorebook.ts`
- Test: `tests/core/store/effects/handlers/lorebook.test.ts`

**Interfaces:**
- Consumes: `writeStream`/`clearStream` (imported by Task 1); `readStream`/`clearStream` (test, imported by Task 1).
- Produces: `lorebookKeysHandler.completion` writes the joined final keys to `lb-keys:<entryId>` (success) / clears (failure).

- [ ] **Step 1: Add the failing test**

In `tests/core/store/effects/handlers/lorebook.test.ts`, append:

```ts
describe("lorebookKeysHandler dual-write", () => {
  const completeCtx = (
    entryId: string,
    over: Record<string, unknown> = {},
  ) =>
    ({
      target: { type: "lorebookKeys", entryId },
      getState: () => ({ ui: { lorebook: { selectedEntryId: entryId } } }),
      dispatch: vi.fn(),
      accumulatedText: "KEYS: alpha, beta",
      generationSucceeded: true,
      ...over,
    }) as unknown as CompletionContext<never>;

  it("completion writes the joined final keys to the buffer on success", async () => {
    clearStream("lb-keys:k1");
    await lorebookKeysHandler.completion(completeCtx("k1"));
    // api.v1.lorebook.entry mock returns no existing keys / empty displayName,
    // so the final keys are exactly the parsed ["alpha","beta"].
    expect(readStream("lb-keys:k1")).toBe("alpha, beta");
    clearStream("lb-keys:k1");
  });

  it("completion clears the buffer on failure", async () => {
    // seed the buffer, then a failed completion must clear it
    clearStream("lb-keys:k1");
    await lorebookKeysHandler.completion(completeCtx("k1"));
    await lorebookKeysHandler.completion(
      completeCtx("k1", { generationSucceeded: false, accumulatedText: "" }),
    );
    expect(readStream("lb-keys:k1")).toBeUndefined();
    clearStream("lb-keys:k1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store/effects/handlers/lorebook.test.ts`
Expected: FAIL — `readStream("lb-keys:k1")` is `undefined` (the keys handler doesn't write the buffer yet).

- [ ] **Step 3: Dual-write in `lorebookKeysHandler.completion`**

In `lorebookKeysHandler.completion`, in the success branch after the existing
`await api.v1.lorebook.updateEntry(ctx.target.entryId, { keys: finalKeys });`, add:

```ts
      writeStream(`lb-keys:${ctx.target.entryId}`, finalKeys.join(", "));
```

In the same `completion`, inside the `else` branch (the `// Cancelled or failed`
block, after the `if (ctx.target.entryId === currentSelected) { … }`), add:

```ts
      clearStream(`lb-keys:${ctx.target.entryId}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/store/effects/handlers/lorebook.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Format + commit**

```bash
npx prettier -w src/core/store/effects/handlers/lorebook.ts tests/core/store/effects/handlers/lorebook.test.ts
git add src/core/store/effects/handlers/lorebook.ts tests/core/store/effects/handlers/lorebook.test.ts
git commit -m "feat(jsx): lorebook keys handler dual-writes final keys to the JSX buffer"
```

---

### Task 3: `EntityEditPane` — extract `useGenField`, refactor Summary

**Files:**
- Modify: `src/ui-jsx/panels/world/EntityEditPane.tsx`

**Interfaces:**
- Produces: `useGenField({ requestId, bufferKey, draft, arm }): { pending, live, onGenerate }` — reused for Content/Keys in Task 4.

> Behavior-preserving for Summary. Verified by `npx tsc --noEmit` + `npm run build`; Summary re-confirmed in the final live pass.

- [ ] **Step 1: Add the `genZapStyle` helper + `useGenField` hook**

In `src/ui-jsx/panels/world/EntityEditPane.tsx`, add a module-level style helper near the other style consts (after `disabledZap`):

```ts
const genZapStyle = (pending: boolean) => ({
  background: "none",
  border: "none",
  cursor: pending ? "default" : "pointer",
  opacity: pending ? 0.4 : 1,
});
```

Then, immediately BEFORE `export function EntityEditPane(`, add the shared hook:

```tsx
// Shared generate-field wiring: pending (isRequestActive), live stream display,
// and a genRef-guarded transfer of the final buffered text into the editable
// draft on completion. `arm` is the field-specific dispatch (Summary dispatches
// directly; Content/Keys promote + select first). requestId/bufferKey are "" when
// not yet available (a draft with no lorebook entry), so the field isn't pending
// and the button stays clickable.
function useGenField(opts: {
  requestId: string;
  bufferKey: string;
  draft: { value: string; setValue: (v: string) => void };
  arm: () => void;
}): { pending: boolean; live: string | undefined; onGenerate: () => void } {
  const pending = useSlice((s) =>
    opts.requestId ? isRequestActive(s.runtime, opts.requestId) : false,
  );
  const live = useStream(opts.bufferKey);
  const genRef = useRef(false);

  // Wipe a stale buffer on open / when the key changes post-promotion; clean up
  // on unmount.
  useEffect(() => {
    if (opts.bufferKey) clearStream(opts.bufferKey);
    return () => {
      if (opts.bufferKey) clearStream(opts.bufferKey);
    };
  }, [opts.bufferKey]);

  // Stage the final into the editable draft when a pane-triggered generation
  // finishes. genRef guards mount/stale/foreign completions; [pending, live] deps
  // make it order-independent (fires once the request has cleared and the final
  // is in the buffer; on failure the handler cleared it, so nothing stages).
  useEffect(() => {
    if (!genRef.current || pending) return;
    if (live !== undefined) opts.draft.setValue(live);
    if (opts.bufferKey) clearStream(opts.bufferKey);
    genRef.current = false;
  }, [pending, live]);

  const onGenerate = () => {
    if (pending) return;
    genRef.current = true;
    if (opts.bufferKey) clearStream(opts.bufferKey);
    opts.arm();
  };

  return { pending, live, onGenerate };
}
```

- [ ] **Step 2: Replace the Summary hooks block with a `useGenField` call**

In `EntityEditPane`, DELETE the summary-streaming hooks block — from
`const summaryReqId = …` through the closing `}, [summaryPending, summaryLive]);`
of the transfer effect (the block that declares `summaryReqId`, `summaryKey`,
`summaryPending`, `summaryLive`, `genRef`, and the two `useEffect`s) — and DELETE
the `onGenerateSummary` function (the `const onGenerateSummary = () => { … };`
below `onCategory`). Replace the deleted hooks block (keep it among the hooks,
before `if (!entity) return null;`) with:

```tsx
  const summaryGen = useGenField({
    requestId: `se-entity-summary-${entityId}`,
    bufferKey: `entity-summary:${entityId}`,
    draft: summary,
    arm: () =>
      store.dispatch(
        uiEntitySummaryGenerationRequested({
          entityId,
          requestId: `se-entity-summary-${entityId}`,
        }),
      ),
  });
```

- [ ] **Step 3: Point the Summary button + textarea at `summaryGen`**

In the Summary section, update the button and textarea references:
- Button: `title={summaryGen.pending ? "Generating…" : "Generate summary"}`,
  `onClick={summaryGen.onGenerate}`, `disabled={summaryGen.pending}`,
  `style={genZapStyle(summaryGen.pending)}`.
- Textarea: `disabled={summaryGen.pending}`, `value={summaryGen.live ?? summary.value}`.

(The `useRef`/`useEffect`/`clearStream`/`useStream`/`isRequestActive` imports stay — they are now used by `useGenField`.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0 (no unused `summaryReqId`/`summaryKey`/etc. — they were removed).

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors. (If it fails with a `ModuleKind`/`@rollup` or sandbox-network error, that is the known env issue — report as a concern, do not modify package.json.)

- [ ] **Step 5: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityEditPane.tsx
git add src/ui-jsx/panels/world/EntityEditPane.tsx
git commit -m "refactor(jsx): extract useGenField hook, refactor Summary onto it"
```

---

### Task 4: `EntityEditPane` — enable Content + Keys generation

**Files:**
- Modify: `src/ui-jsx/panels/world/EntityEditPane.tsx`

**Interfaces:**
- Consumes: `useGenField` (Task 3); `uiLorebookEntrySelected`, `uiLorebookContentGenerationRequested`, `uiLorebookKeysGenerationRequested` (core/store barrel).

> Verified by `npx tsc --noEmit` + `npm run build`; then the final manual harness pass (CONTROLLER + user — the implementer stops after build).

- [ ] **Step 1: Add imports**

Add these three to the `../../../core/store` import list in `EntityEditPane.tsx`:

```tsx
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
```

- [ ] **Step 2: Add the Content + Keys `useGenField` calls + unmount cleanup**

Among the hooks (after `summaryGen`, before `if (!entity) return null;`), add:

```tsx
  const eid = entity?.lorebookEntryId ?? "";
  const contentGen = useGenField({
    requestId: eid ? `lb-item-${eid}-content` : "",
    bufferKey: eid ? `lb-content:${eid}` : "",
    draft: content,
    arm: () =>
      void (async () => {
        const liveId = await ensureLiveEntryId(entityId);
        if (!liveId) return;
        store.dispatch(
          uiLorebookEntrySelected({ entryId: liveId, categoryId: null }),
        );
        store.dispatch(
          uiLorebookContentGenerationRequested({
            requestId: `lb-item-${liveId}-content`,
          }),
        );
      })(),
  });
  const keysGen = useGenField({
    requestId: eid ? `lb-item-${eid}-keys` : "",
    bufferKey: eid ? `lb-keys:${eid}` : "",
    draft: keys,
    arm: () =>
      void (async () => {
        const liveId = await ensureLiveEntryId(entityId);
        if (!liveId) return;
        store.dispatch(
          uiLorebookEntrySelected({ entryId: liveId, categoryId: null }),
        );
        store.dispatch(
          uiLorebookKeysGenerationRequested({
            requestId: `lb-item-${liveId}-keys`,
          }),
        );
      })(),
  });

  // Release the shared lorebook selection when the pane closes.
  useEffect(
    () => () =>
      store.dispatch(uiLorebookEntrySelected({ entryId: null, categoryId: null })),
    [],
  );
```

- [ ] **Step 3: Enable the Content button + textarea**

Replace the Content generate button (currently `title="Generate (coming soon)" disabled style={disabledZap}`) with:

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

And update the Content textarea: `disabled={loading || contentGen.pending}`,
`value={contentGen.live ?? content.value}` (keep the existing `onInput`, `rows`,
`placeholder`, `style`).

- [ ] **Step 4: Enable the Keys button + input**

Replace the Keys generate button (currently `title="Generate (coming soon)" disabled style={disabledZap}`) with:

```tsx
          <button
            title={keysGen.pending ? "Generating…" : "Generate keys"}
            onClick={keysGen.onGenerate}
            disabled={keysGen.pending}
            style={genZapStyle(keysGen.pending)}
          >
            <Zap size={ICON_SIZE} />
          </button>
```

And update the Keys input: `disabled={loading || keysGen.pending}`,
`value={keysGen.live ?? keys.value}` (keep the existing `onInput`, `placeholder`,
`style`).

(If `disabledZap` is now unused after removing both disabled buttons,
`noUnusedLocals` will flag it — delete the `const disabledZap = …` declaration.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: builds `dist/NAI-story-engine.naiscript` with no errors (env-error caveat as in Task 3).

- [ ] **Step 6: Manual harness verification** — CONTROLLER + USER ONLY, not the implementer.

(For reference — the controller runs this with the user. The implementer stops after Step 5.) In NovelAI, Story Engine (JSX) tab: open an entity's edit pane. Click **Generate content** on a fresh draft → it promotes to live, the content textarea streams (prefill header + body), and on completion the full content stages into the editable textarea; Save. Click **Generate keys** → keys appear in the input on completion. Both commit to the lorebook (reopening shows them). Content/Keys are disabled while `loading`. Re-confirm **Summary** still streams (Task 3 refactor).

- [ ] **Step 7: Format + commit**

```bash
npx prettier -w src/ui-jsx/panels/world/EntityEditPane.tsx
git add src/ui-jsx/panels/world/EntityEditPane.tsx
git commit -m "feat(jsx): entity pane Content + Keys generation via useGenField"
```

---

## Self-Review Notes

- **Spec coverage:** content dual-write + test (Task 1); keys dual-write + test (Task 2); `useGenField` hook + Summary refactor (Task 3); Content + Keys enable + promote/select/dispatch + unmount selection clear (Task 4). Buffer keys / request ids consistent; SUI sinks kept; sticky lorebook commit unchanged.
- **Type consistency:** `useGenField({ requestId, bufferKey, draft, arm })` defined in Task 3, consumed for Summary (Task 3) and Content/Keys (Task 4); buffer keys `lb-content:<id>`/`lb-keys:<id>` and request ids `lb-item-<id>-content|keys` identical across handlers (Tasks 1/2) and pane (Task 4); `ensureLiveEntryId` (pre-existing) returns the entry id used in the arm dispatch.
- **Placeholders:** none — every step has complete code. Hooks precede the early return; `useGenField`/`useRef`/`useEffect` are runtime globals or module-level (not imported). Unused `disabledZap`/`summaryReqId` removals are called out to satisfy `noUnusedLocals`.
