# JSX Thread Edit Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JSX thread (WorldGroup) edit pane — create/title/summarize threads and manage membership — completing the JSX World layer.

**Architecture:** Mirror the existing `EntityEditPane`: title/summary as `useDraftField` drafts committed on Save, summary generation via the shared `useGenField`/`stream-buffer` staging mechanism, membership via immediate `entityGroupToggled` dispatches. Two backend fixes make thread-summary generation buffer-backed and queue-registered (the latter is the same CRITICAL that caused entity-summary data loss).

**Tech Stack:** TypeScript (strict), Preact/JSX (NAI runtime globals `h`/`Fragment`/`useState`/`useEffect`/`useRef`), nai-store, vitest. Runs in QuickJS (no DOM, no `setTimeout`, no `console.log`).

## Global Constraints

- Prompts live in `src/core/utils/prompts.ts` only — do not touch prompt text in this slice.
- No `api.v1.lorebook.updateEntry` / `dispatch` in keystroke `onChange`; title/summary draft locally and commit on Save. Membership toggles are explicit clicks, so immediate dispatch is fine.
- `storageKey`-bound inputs are owned by storyStorage — N/A here (this pane uses local `useDraftField` drafts, like `EntityEditPane`, not `storageKey`).
- Hooks (`useDraftField`, `useGenField`, `useSlice`) must precede any early `return null` (rules of hooks).
- Do NOT bump `project.yaml` `version` (branch v14 already carries the in-progress version). The build stamps `project.yaml` `updatedAt` — revert that stamp before committing.
- Match SUI `SeThreadEditPane` scope exactly: title + summary + members. No Delete button in the pane (delete lives on the `ThreadItem` card); no lorebook toggle; no reforge.
- Member list shows **all** entities (`Object.values(entitiesById)`, no forge-draft filter) — matches SUI.
- Request id / buffer key naming mirrors entity summary: request id `se-thread-summary-<groupId>`, buffer key `thread-summary:<groupId>`.

---

### Task 1: Thread summary generation — buffer dual-write + queue registration

Make thread-summary generation safe for the pane: the handler writes the live/final text to the effect-free stream buffer (so the pane can stage it), and the effect registers the request in the runtime queue (so `isRequestActive` is true for the whole stream — without this, the pane's transfer fires on the first token and Save loses all but the first token, exactly as it did for entity summary).

**Files:**
- Modify: `src/core/store/effects/handlers/summary.ts` (`threadSummaryHandler`, ~lines 85–101)
- Modify: `src/core/store/effects/summary-generation.ts` (`uiThreadSummaryGenerationRequested` handler, ~lines 220–238)
- Test: `tests/core/store/effects/handlers/summary.test.ts` (extend)
- Test: `tests/core/store/effects/summary-generation.test.ts` (extend)

**Interfaces:**
- Consumes: `writeStream`, `clearStream`, `readStream` (`src/core/store/stream-buffer`); `requestQueued` (already imported in `summary-generation.ts`); target type `{ type: "threadSummary"; groupId: string }` (`types.ts`).
- Produces: buffer key `` `thread-summary:${groupId}` `` carrying live tokens then the final trimmed summary; a `runtime/requestQueued` dispatch with `{ id: requestId, type: "threadSummary", targetId: groupId }` before `generationSubmitted`.

- [ ] **Step 1: Write the failing handler tests**

Append to `tests/core/store/effects/handlers/summary.test.ts` (the file already imports `readStream`, `clearStream`, `CompletionContext`, `GenerationStrategy`, `vi`; add `threadSummaryHandler` to the import from `.../handlers/summary` and add a `StreamingContext` import):

```ts
type ThreadSummaryTarget = Extract<
  GenerationStrategy["target"],
  { type: "threadSummary" }
>;

function makeThreadCtx(
  over: Partial<CompletionContext<ThreadSummaryTarget>> = {},
): CompletionContext<ThreadSummaryTarget> {
  return {
    target: { type: "threadSummary", groupId: "g1" },
    getState: () => ({ ui: { activeEditId: "g1" } }),
    accumulatedText: "",
    generationSucceeded: true,
    dispatch: vi.fn(),
    ...over,
  } as unknown as CompletionContext<ThreadSummaryTarget>;
}

describe("threadSummaryHandler.streaming", () => {
  it("writes accumulatedText to the thread-summary buffer", () => {
    clearStream("thread-summary:g1");
    const ctx = makeThreadCtx({ accumulatedText: "A rivalry" });
    threadSummaryHandler.streaming(
      ctx as unknown as StreamingContext<ThreadSummaryTarget>,
      "rivalry",
    );
    expect(readStream("thread-summary:g1")).toBe("A rivalry");
    clearStream("thread-summary:g1");
  });
});

describe("threadSummaryHandler.completion", () => {
  it("success: writes the trimmed final to the buffer", async () => {
    clearStream("thread-summary:g1");
    const ctx = makeThreadCtx({ accumulatedText: "  A tense rivalry  " });
    await threadSummaryHandler.completion(ctx);
    expect(readStream("thread-summary:g1")).toBe("A tense rivalry");
    clearStream("thread-summary:g1");
  });

  it("failure: clears the buffer", async () => {
    clearStream("thread-summary:g1");
    writeStreamForTest("thread-summary:g1", "stale");
    const ctx = makeThreadCtx({
      accumulatedText: "",
      generationSucceeded: false,
    });
    await threadSummaryHandler.completion(ctx);
    expect(readStream("thread-summary:g1")).toBeUndefined();
  });
});
```

For the failure test's seed, import `writeStream as writeStreamForTest` alongside the existing imports (add to the `stream-buffer` import line): `import { readStream, clearStream, writeStream as writeStreamForTest } from "../../../../../src/core/store/stream-buffer";`.

- [ ] **Step 2: Run the handler tests to verify they fail**

Run: `npx vitest run tests/core/store/effects/handlers/summary.test.ts`
Expected: FAIL — `threadSummaryHandler.streaming` does not write the buffer (readStream undefined); completion failure does not clear.

- [ ] **Step 3: Implement the handler dual-write**

In `src/core/store/effects/handlers/summary.ts`, replace `threadSummaryHandler` (the `EDIT_PANE_CONTENT`-only version) with:

```ts
export const threadSummaryHandler: GenerationHandlers<ThreadSummaryTarget> = {
  streaming(
    ctx: StreamingContext<ThreadSummaryTarget>,
    _newText: string,
  ): void {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT, ctx.accumulatedText);
    // JSX pane stages the live text from the effect-free buffer (per-token, no
    // store dispatch), then stages the final into its editable draft.
    writeStream(`thread-summary:${ctx.target.groupId}`, ctx.accumulatedText);
  },

  async completion(ctx: CompletionContext<ThreadSummaryTarget>): Promise<void> {
    if (ctx.generationSucceeded && ctx.accumulatedText) {
      const trimmed = ctx.accumulatedText.trim();
      // Carry the final into the buffer for the open JSX pane to stage; the pane
      // owns clearing. Thread summary is only generated from the open pane, so
      // there is no background ...Updated branch (unlike entity summary).
      writeStream(`thread-summary:${ctx.target.groupId}`, trimmed);
      await api.v1.storyStorage.set(EDIT_PANE_CONTENT, trimmed);
    } else {
      clearStream(`thread-summary:${ctx.target.groupId}`);
    }
  },
};
```

(`writeStream`/`clearStream` and the `StreamingContext`/`CompletionContext`/`ThreadSummaryTarget` types are already imported in this file.)

- [ ] **Step 4: Run the handler tests to verify they pass**

Run: `npx vitest run tests/core/store/effects/handlers/summary.test.ts`
Expected: PASS (existing entity tests + 3 new thread tests).

- [ ] **Step 5: Write the failing effect tests**

Append to `tests/core/store/effects/summary-generation.test.ts` (harness `makeHarness`/`makeState` already present; `uiThreadSummaryGenerationRequested` must be added to the import from `.../store/index`):

```ts
describe("uiThreadSummaryGenerationRequested effect", () => {
  it("registers the request in the runtime queue before submitting generation", async () => {
    const { fire, dispatch } = makeHarness(makeState());
    await fire(
      uiThreadSummaryGenerationRequested({
        groupId: "g1",
        requestId: "se-thread-summary-g1",
      }),
    );
    const queuedCall = dispatch.mock.calls.find(
      ([a]) => a.type === "runtime/requestQueued",
    );
    expect(queuedCall?.[0].payload).toEqual({
      id: "se-thread-summary-g1",
      type: "threadSummary",
      targetId: "g1",
    });
    const queuedIdx = dispatch.mock.calls.findIndex(
      ([a]) => a.type === "runtime/requestQueued",
    );
    const submittedIdx = dispatch.mock.calls.findIndex(
      ([a]) => a.type === "ui/generationSubmitted",
    );
    expect(queuedIdx).toBeGreaterThanOrEqual(0);
    expect(queuedIdx).toBeLessThan(submittedIdx);
  });

  it("does not double-queue when the id is already tracked", async () => {
    const state = makeState(undefined, {
      queue: [{ id: "se-thread-summary-g1" }],
    });
    const { fire, dispatch } = makeHarness(state);
    await fire(
      uiThreadSummaryGenerationRequested({
        groupId: "g1",
        requestId: "se-thread-summary-g1",
      }),
    );
    expect(
      dispatch.mock.calls.some(([a]) => a.type === "runtime/requestQueued"),
    ).toBe(false);
  });
});
```

Add the import: `import { uiEntitySummaryGenerationRequested, uiThreadSummaryGenerationRequested } from "../../../../src/core/store/index";` (extend the existing `uiEntitySummaryGenerationRequested` import).

- [ ] **Step 6: Run the effect tests to verify they fail**

Run: `npx vitest run tests/core/store/effects/summary-generation.test.ts`
Expected: FAIL — no `runtime/requestQueued` dispatch for the thread request.

- [ ] **Step 7: Implement the effect queue registration**

In `src/core/store/effects/summary-generation.ts`, in the `uiThreadSummaryGenerationRequested` handler, insert before the `dispatch(generationSubmitted({ ... }))` call:

```ts
const rt = getState().runtime;
const alreadyTracked =
  rt.activeRequest?.id === requestId ||
  rt.queue.some((r) => r.id === requestId);
if (!alreadyTracked) {
  dispatch(
    requestQueued({ id: requestId, type: "threadSummary", targetId: groupId }),
  );
}
```

(`requestQueued` is already imported. `requestId` and `groupId` are already destructured from `action.payload`.)

- [ ] **Step 8: Run the effect tests to verify they pass, then the full suite**

Run: `npx vitest run tests/core/store/effects/summary-generation.test.ts`
Expected: PASS (existing entity tests + 2 new thread tests).
Run: `npx vitest run` and `npx tsc --noEmit`
Expected: full suite PASS; tsc exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/core/store/effects/handlers/summary.ts src/core/store/effects/summary-generation.ts tests/core/store/effects/handlers/summary.test.ts tests/core/store/effects/summary-generation.test.ts
git commit -m "feat(thread): buffer-backed + queue-registered thread summary generation"
```

---

### Task 2: ThreadEditPane component

Build the JSX thread edit pane: title + summary drafts (Save commits), summary generation via `useGenField`, and a member toggle list. Also export `CATEGORIES` from `EntityEditPane` so the member list reuses the canonical category order/labels (one-word, behavior-preserving change to the entity pane).

**Files:**
- Modify: `src/ui-jsx/panels/world/EntityEditPane.tsx:59` (add `export` to `const CATEGORIES`)
- Create: `src/ui-jsx/panels/world/ThreadEditPane.tsx`

**Interfaces:**
- Consumes: `useSlice`, `useStream` (`../../bridge`); `useDraftField` (`../../hooks`); `store`, `groupRenamed`, `groupSummaryUpdated`, `entityGroupToggled`, `uiThreadSummaryGenerationRequested`, `uiEditableDeactivate` (`../../../core/store`); `isRequestActive` (`./world-select`); `clearStream` (`../../../core/store/stream-buffer`); `CATEGORIES` (`./EntityEditPane`); `T`, `SP` (`../../style`); feather icons.
- Produces: `export function ThreadEditPane(props: { groupId: string })` — used by `StoryEngine.tsx` in Task 3.
- Reuses the `useGenField` pattern (copied minimal inline, see below — the entity pane's `useGenField` is module-private; this pane needs only the summary variant).

- [ ] **Step 1: Export CATEGORIES from EntityEditPane**

In `src/ui-jsx/panels/world/EntityEditPane.tsx`, change line 59 from:

```ts
const CATEGORIES: { id: DulfsFieldID; label: string; Icon: typeof User }[] = [
```

to:

```ts
export const CATEGORIES: {
  id: DulfsFieldID;
  label: string;
  Icon: typeof User;
}[] = [
```

- [ ] **Step 2: Verify the entity pane still type-checks (no behavior change)**

Run: `npx tsc --noEmit`
Expected: exit 0 (adding `export` is inert).

- [ ] **Step 3: Create ThreadEditPane.tsx**

Create `src/ui-jsx/panels/world/ThreadEditPane.tsx`:

```tsx
// ThreadEditPane — edit pane for a WorldGroup (Thread), counterpart to
// EntityEditPane and SUI's SeThreadEditPane. Title + summary are local drafts
// committed on Save (groupRenamed + groupSummaryUpdated); the summary has a
// generate zap that streams into the draft via the shared stream-buffer.
// Membership toggles dispatch entityGroupToggled immediately (not part of the
// draft). No Delete (that lives on the ThreadItem card) and no lorebook toggle
// (a later slice) — matching SUI scope.

import { useSlice, useStream } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  uiThreadSummaryGenerationRequested,
  uiEditableDeactivate,
} from "../../../core/store";
import { isRequestActive } from "./world-select";
import { clearStream } from "../../../core/store/stream-buffer";
import { CATEGORIES } from "./EntityEditPane";
import { ArrowLeft, Zap, ToggleLeft, ToggleRight } from "nai:icons/feather";

const ICON_SIZE = 16;

const inputStyle = {
  background: T.bg2,
  color: T.text,
  fontFamily: T.fontDefault,
  padding: SP.md,
  border: "none",
} as const;
const sectionLabel = {
  fontSize: "0.8em",
  fontWeight: "bold",
  color: T.textHeadings,
} as const;
const genZapStyle = (pending: boolean) =>
  ({
    background: "none",
    border: "none",
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.4 : 1,
  }) as const;

export function ThreadEditPane(props: { groupId: string }) {
  const { groupId } = props;
  const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId));
  const entitiesById = useSlice((s) => s.world.entitiesById);

  const title = useDraftField(group?.title ?? "");
  const summary = useDraftField(group?.summary ?? "");

  const reqId = `se-thread-summary-${groupId}`;
  const bufferKey = `thread-summary:${groupId}`;
  const pending = useSlice((s) => isRequestActive(s.runtime, reqId));
  const live = useStream(bufferKey);
  const genRef = useRef(false);

  // Wipe a stale buffer on open; clean up on unmount.
  useEffect(() => {
    clearStream(bufferKey);
    return () => clearStream(bufferKey);
  }, [bufferKey]);

  // Stage the final streamed summary into the editable draft when a
  // pane-triggered generation finishes. genRef guards mount/stale/foreign
  // completions; [pending, live] deps make it order-independent (on failure the
  // handler cleared the buffer, so nothing stages).
  useEffect(() => {
    if (!genRef.current || pending) return;
    if (live !== undefined) summary.setValue(live);
    clearStream(bufferKey);
    genRef.current = false;
  }, [pending, live]);

  if (!group) return null;

  const onGenerate = () => {
    if (pending || genRef.current) return;
    genRef.current = true;
    clearStream(bufferKey);
    store.dispatch(
      uiThreadSummaryGenerationRequested({ groupId, requestId: reqId }),
    );
  };

  const close = () => store.dispatch(uiEditableDeactivate());

  const onSave = () => {
    store.dispatch(groupRenamed({ groupId, title: title.value.trim() }));
    store.dispatch(
      groupSummaryUpdated({ groupId, summary: summary.value.trim() }),
    );
    close();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        paddingBottom: "32px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={close}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            display: "flex",
            alignItems: "center",
            padding: 0,
          }}
        >
          <ArrowLeft size={ICON_SIZE} />
        </button>
        <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold" }}>
          {title.value || "New Thread"}
        </span>
        <button onClick={onSave} style={{ padding: "4px 16px" }}>
          Save
        </button>
      </div>

      {/* Title */}
      <input
        placeholder="Thread title..."
        value={title.value}
        onInput={(e) => title.setValue((e.target as HTMLInputElement).value)}
        style={inputStyle}
      />

      {/* Summary */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <span style={{ ...sectionLabel, flex: 1 }}>Summary</span>
        <button
          title="Generate summary"
          onClick={onGenerate}
          disabled={pending}
          style={genZapStyle(pending)}
        >
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="What is this thread's dynamic?"
        value={live ?? summary.value}
        disabled={pending}
        onInput={(e) =>
          summary.setValue((e.target as HTMLTextAreaElement).value)
        }
        style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
      />

      {/* Members */}
      <span style={sectionLabel}>Members</span>
      {CATEGORIES.map((cat) => {
        const members = Object.values(entitiesById).filter(
          (e) => e.categoryId === cat.id,
        );
        if (members.length === 0) return null;
        return (
          <div
            key={cat.id}
            style={{ display: "flex", flexDirection: "column", gap: SP.xs }}
          >
            <span
              style={{ fontSize: "0.75em", color: T.textDisabled }}
            >
              {cat.label}
            </span>
            {members.map((e) => {
              const isMember = group.entityIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() =>
                    store.dispatch(
                      entityGroupToggled({ groupId, entityId: e.id }),
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SP.sm,
                    background: T.bg2,
                    border: "none",
                    cursor: "pointer",
                    // Icons inherit this via SVG currentColor — the codebase
                    // passes only `size` to feather icons, never a color prop.
                    color: isMember ? T.warning : T.text,
                    padding: SP.sm,
                    textAlign: "left",
                  }}
                >
                  {isMember ? (
                    <ToggleRight size={ICON_SIZE} />
                  ) : (
                    <ToggleLeft size={ICON_SIZE} />
                  )}
                  <span style={{ flex: 1 }}>{e.name || "(unnamed)"}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (`ThreadEditPane` is not yet imported anywhere — that is Task 3. If `noUnusedLocals` flags nothing here since it is an exported symbol; confirm no unused imports remain.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✅ Built: dist/NAI-story-engine.naiscript`. Then revert the `project.yaml` `updatedAt` stamp: `git checkout project.yaml`.

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/world/EntityEditPane.tsx src/ui-jsx/panels/world/ThreadEditPane.tsx
git commit -m "feat(jsx): ThreadEditPane — title/summary drafts, summary gen, member toggles"
```

---

### Task 3: Wire-up — add-thread, routing, open-from-card

Connect the pane: enable the World add-thread button (create group + open pane), route `activeEditId` to `ThreadEditPane` when it names a group, and make the `ThreadItem` title open the pane.

**Files:**
- Modify: `src/ui-jsx/panels/world/World.tsx` (add-thread button + import)
- Modify: `src/ui-jsx/panels/StoryEngine.tsx` (group routing)
- Modify: `src/ui-jsx/panels/world/ThreadItem.tsx` (title opens pane + import)

**Interfaces:**
- Consumes: `groupCreated`, `uiEditableActivate` (`../../../core/store`); `ThreadEditPane` (`./world/ThreadEditPane`).
- Produces: no new exports.

- [ ] **Step 1: Enable add-thread in World.tsx**

In `src/ui-jsx/panels/world/World.tsx`, add `groupCreated` to the `../../../core/store` import. Add an `onAddThread` handler next to `onAddEntity`:

```ts
const onAddThread = () => {
  const id = api.v1.uuid();
  store.dispatch(
    groupCreated({ group: { id, title: "", summary: "", entityIds: [] } }),
  );
  store.dispatch(uiEditableActivate({ id }));
};
```

Replace the disabled add-thread button (currently):

```tsx
<button title="Add thread (coming soon)" disabled style={DISABLED_BTN}>
  <Layers size={ICON_SIZE} />
</button>
```

with:

```tsx
<button title="Add thread" onClick={onAddThread} style={ICON_BTN}>
  <Layers size={ICON_SIZE} />
</button>
```

(`DISABLED_BTN` may now be unused — if `noUnusedLocals` flags it, remove the `DISABLED_BTN` const.)

- [ ] **Step 2: Route groups in StoryEngine.tsx**

In `src/ui-jsx/panels/StoryEngine.tsx`, import `ThreadEditPane` and add a group check + route:

```tsx
import { EntityEditPane } from "./world/EntityEditPane";
import { ThreadEditPane } from "./world/ThreadEditPane";
```

```tsx
const editId = useSlice((s) => s.ui.activeEditId);
const isEntity = useSlice((s) =>
  editId ? !!s.world.entitiesById[editId] : false,
);
const isThread = useSlice((s) =>
  editId ? s.world.groups.some((g) => g.id === editId) : false,
);

if (editId && isEntity) {
  return <EntityEditPane entityId={editId} />;
}
if (editId && isThread) {
  return <ThreadEditPane groupId={editId} />;
}
```

- [ ] **Step 3: Make the ThreadItem title open the pane**

In `src/ui-jsx/panels/world/ThreadItem.tsx`, add `uiEditableActivate` to the `../../../core/store` import. Replace the title `<span>`:

```tsx
<span style={{ flex: 1, color: T.textHeadings }}>
  {group.title || "New Thread"}
</span>
```

with a button:

```tsx
<button
  onClick={() => store.dispatch(uiEditableActivate({ id: groupId }))}
  style={{
    flex: 1,
    textAlign: "left",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: T.textHeadings,
    padding: 0,
  }}
>
  {group.title || "New Thread"}
</button>
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm run build`
Expected: `✅ Built: dist/NAI-story-engine.naiscript`. Then `git checkout project.yaml` to revert the `updatedAt` stamp.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no UI unit tests added; this confirms no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/world/World.tsx src/ui-jsx/panels/StoryEngine.tsx src/ui-jsx/panels/world/ThreadItem.tsx
git commit -m "feat(jsx): wire ThreadEditPane — add-thread, group routing, title opens pane"
```

---

## Live Verification (after all tasks, batched with the user)

The scratch story is fine to mutate. Reload the freshly built dist, then:

1. **Add thread**: click the layers (+thread) button → a thread edit pane opens with an empty title.
2. **Title + members**: type a title; toggle a couple of entities on → the `ThreadItem` card (visible after Back) shows those members; the toggles reflect membership live.
3. **Generate summary**: click the summary zap → tokens stream into the summary textarea (textarea disabled, zap dim while pending); on completion the full summary lands in the editable draft.
4. **Save persists** (the CRITICAL): Save → reopen the thread → the **full** summary and title are there (not just the first token). This is the queue-registration fix; verify explicitly.
5. **Back discards** title/summary edits made after the last Save, but membership toggles (committed immediately) persist.
6. **Delete** the throwaway thread from the `ThreadItem` card's trash icon.

## Notes for the executor

- `useState`/`useEffect`/`useRef` are NAI runtime globals in `.tsx` (see `external/jsx-typings.d.ts`) — no import, matching `EntityEditPane`.
- The `useGenField` hook in `EntityEditPane` is module-private and lorebook-aware; this pane inlines only the summary-shaped subset (pending/live/genRef/transfer), which is simpler and avoids exporting a hook shaped around lorebook promotion.
- If `noUnusedLocals`/`noUnusedParameters` flags `DISABLED_BTN` (World) or any import, remove it — do not suppress.
