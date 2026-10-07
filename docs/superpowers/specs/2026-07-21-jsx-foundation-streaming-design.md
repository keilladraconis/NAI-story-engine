# JSX Foundation Card Live Streaming

**Date:** 2026-07-21
**Status:** Approved (design)
**Branch:** v14

## Context

The SUI→JSX migration has landed Chat, Foundation, World display, and the entity
edit pane. Generation streaming into the JSX panel is solved only for **chat**
(via the effect-free `stream-buffer` + `useStream`); the `jsx-streaming-flush`
memory lists foundation/lorebook/list as TODO.

Foundation generation already _works_ in JSX — the completion handler commits to
the store (`attgUpdated`, etc.) and the JSX card reads the store, so the result
appears on completion. What's missing is **live per-token streaming** into the
card: today the card is blank during generation, then the result pops in.

This slice adds that live streaming for the Foundation cards. It is the first,
smallest piece of the broader "entity/foundation generation streaming" work,
chosen to prove the shared-handler → `stream-buffer` → `useStream` pattern before
the harder entity-pane generate buttons (draft staging), which come next.

## Goals

- The JSX Foundation cards (attg/style/intent/contract/shape) display live
  per-token text while generating, mirroring the chat streamer.
- **Dual-write:** keep the existing SUI sinks intact (SUI panel keeps streaming
  for side-by-side comparison); add `stream-buffer` writes for JSX.

## Non-Goals

- Entity-pane generate buttons / draft staging (next slice).
- `worldState` (not rendered in the JSX Foundation panel).
- Removing the SUI `updateParts` sinks (a later cleanup when SUI is deleted).
- Lorebook / list streaming.

## Mechanism (mirrors the working chat streamer)

Per-token text goes to the effect-free `stream-buffer` (a plain Map + subscriber
channel) — NOT through per-token store dispatch, which wedges the JSX Preact
render flush. The card reads the live buffer via `useStream`; the committed value
still lands in the store once, on completion, then the buffer is cleared so the
card falls back to the committed value.

Buffer key: `` `foundation:${field}` `` where `field` ∈ {shape, intent, contract,
attg, style} (the FoundationTarget.field values the JSX panel renders).

## Handler change — `src/core/store/effects/handlers/foundation.ts`

- Import `writeStream`, `clearStream` from `../../stream-buffer`.
- `streaming(ctx)`: keep the SUI line
  `api.v1.ui.updateParts([{ id: viewId, text: escapeForMarkdown(ctx.accumulatedText) }])`,
  and **add** `writeStream(\`foundation:${ctx.target.field}\`, ctx.accumulatedText)`.
The SUI path escapes for markdown; the JSX path stores raw text (JSX renders
plain with `whiteSpace: pre-wrap`).
- `completion(ctx)`: keep the existing store dispatches; wrap the body in
  `try { … } finally { clearStream(\`foundation:${field}\`) }`so the buffer is
cleared even on failure/empty (early`return`), letting the card fall back to
  the committed store value.

## JSX change — `src/ui-jsx/panels/foundation/FieldCard.tsx`

- Import `useStream` alongside `useSlice` from `../../bridge`.
- Replace `const value = useSlice((s) => d.display(s));` with:
  ```ts
  const storeValue = useSlice((s) => d.display(s));
  const live = useStream(`foundation:${d.id}`);
  const value = live ?? storeValue;
  ```
- No other change — the render already uses `value`. While streaming, `value` is
  the raw accumulated tokens; on completion (`clearStream`), `live` is `undefined`
  and it falls back to the store's committed (formatted) value. The existing
  generating-zap-dim (`isFoundationGenerating`) is unchanged.

## Behavior notes

- During streaming, the **contract** and **shape** cards briefly show the raw
  model output (`REQUIRED:/PROHIBITED:/…`, or `Name\n\nDescription`) until
  completion snaps to the formatted display. This matches the chat streamer's
  raw-stream → cleaned-commit behavior and is acceptable.
- Foundation generation during **SEGA** streams into the cards for free (same
  handler path).
- A card's zap generates directly only when the field is empty (empty → generate;
  filled → refine, which is a chat, not a foundation-field generation). So live
  card streaming is seen when generating an empty field or during SEGA — exactly
  the cases where a foundation generation targets the field.

## Testing

- Unit-test the handler dual-write in a new
  `tests/core/store/effects/handlers/foundation.test.ts`, mirroring the chat
  handler's "streaming handlers" block:
  - `foundationHandler.streaming(ctx, …)` with `field:"intent"` writes
    `ctx.accumulatedText` to `readStream("foundation:intent")` and does NOT
    dispatch.
  - `foundationHandler.completion(ctx)` (succeeded) dispatches `intentUpdated`
    and clears the buffer (`readStream` → `undefined`).
  - `completion` with `generationSucceeded:false` still clears the buffer and
    does not dispatch (the `finally`).
  - `api` is the global test mock (SUI `updateParts` is a no-op); `getState` is a
    `vi.fn()` (the `intent` branch doesn't read it).
- `FieldCard` is tsc-gated + live-verified (watch a foundation field generate —
  e.g. an empty Intent — and confirm tokens stream into the card, then the
  committed value remains after completion).

## Risks / Notes

- `escapeForMarkdown` stays imported for the SUI path (still used); `noUnusedLocals`
  is satisfied.
- The `finally` must not swallow the `await`ed memory/A.N. writes in the attg/style
  branches — they run inside `try` before the implicit return, so `finally` runs
  after them. Correct.
- `useStream` returns a primitive (`string | undefined`) — no `useSlice`
  stability concern.
