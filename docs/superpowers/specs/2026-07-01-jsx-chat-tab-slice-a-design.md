# JSX Chat Tab — Slice A: Shell + Brainstorm + Refine

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** Next slice of the SUI → JSX/Preact UI migration. Ports the Chat tab
shell and the brainstorm + refine chat types to the JSX panel. Forge in chat is
a separate later slice (Slice B).

## Background

The SUI → JSX migration proceeds panel-by-panel, side-by-side, keeping nai-store
as the single source of truth (see the harness spec,
`2026-06-25-jsx-preact-ui-harness-design.md`). The Foundation proof panel is
done. The Chat tab is next because it is the backbone for **refinement** and the
other chat-native interfaces (forge, summary) built in the SUI version.

The chat **brain already lives in `core/` and is reused unchanged**:

- `src/core/store/slices/chat.ts` — the `chat` slice: `chats[]`, `activeChatId`,
  and message reducers (`messageAdded/Updated/Appended/Removed`,
  `messagesPrunedAfter`, `refineCandidateMarked`, …). Source of truth.
- `src/core/chat-types/` — the polymorphic `ChatTypeSpec` registry
  (`brainstorm`, `refine`, `forge`, `summary`) via `getChatTypeSpec(type)`. Each
  spec supplies `headerControls`, `inputPlaceholder`/`sendLabel`/
  `showClearButton`, `onCommit`/`onDiscard`/`onClear`, `handleSend`, etc.
- Effects/actions: `uiChatSubmitUserMessage`, `uiChatRetryGeneration`,
  `uiChatRefineRequested({ fieldId, sourceText, entryId? })`,
  `uiChatRefineCommitted`, `uiChatRefineDiscarded`, `subModeChanged`, and the
  generation strategies. All unchanged.

This slice is therefore a **view-only port**: re-skin the SUI chat UI in JSX,
driven polymorphically by the spec, with **no `core/` changes**.

## SUI reference (parity target)

- `ChatPanel` — shell: header + scrollable message list (column-reverse) +
  input + optional commit bar. Rebuilds on chat id / message-id sequence.
- `ChatHeader` — renders `spec.headerControls()`.
- `SeMessage` — role-styled bubble; **editable plain text** (no markdown) via
  `SeEditableText`; retry + delete controls; system "Context" bubbles collapsed
  by default (`SuiCollapsible`). `forgeSegments` rendering is forge-only.
- `SeBrainstormInput` — textarea + Send/Clear, spec-customized.
- `RefineCommitBar` — Commit / Discard.
- Sessions: `openSeSessionsModal()` (a modal). **We diverge**: in-panel view.
- Tab nav lives in `plugin.ts`: `SuiTabBar` with tabs `Chat | Story Engine`,
  plus effects that switch to Chat when a refine/forge chat is
  created/switched-to, and back to Story Engine on refine commit/discard and
  forge cast/discard.

## Decisions (locked)

1. **View-only port; core reused unchanged.** No changes to slices, specs,
   effects, or strategies.
2. **Sessions switcher is an in-panel view** (not a modal). The Sessions button
   swaps the Chat view for a full-panel chat list with a Back button. No JSX
   modal/portal infrastructure in this slice.
3. **Active tab is local component state** in the JSX panel shell, nudged by
   store subscriptions — not a new nai-store field. The two panels (SUI + JSX)
   keep independent tab state.
4. **Messages render as editable plain text** (matching SUI). No markdown
   renderer in this slice.
5. **Adaptive Foundation zap.** The already-ported JSX Foundation Generate
   button becomes adaptive (empty → generate, non-empty → open refine),
   matching SUI's `SeGenRefinePair` unified mode. This is the leaf change that
   wires refine end-to-end.

## Architecture

### Panel shell — tab navigation

The JSX panel root gains a two-tab shell mirroring SUI:

- Tabs: **Chat** and **Story Engine** (the latter renders `<Foundation/>` today
  and grows in later slices).
- **Active tab** is `useState<"chat" | "engine">` in the shell.
- A `useEffect` registers store subscriptions (via `store.subscribeEffect` /
  `matchesAction`) that programmatically switch tabs, mirroring the SUI plugin
  effects but local to the JSX panel:
  - `chatCreated` / `chatSwitched` where the target chat is a **refine** →
    switch to **Chat**.
  - `uiChatRefineCommitted` / `uiChatRefineDiscarded` → switch to **Story
    Engine**.
  - (Forge triggers are Slice B; the subscription's type check simply doesn't
    match forge yet.)
- The `useEffect` returns a cleanup that disposes the subscriptions.

Tab switching is user-controllable (you can look at brainstorm while a refine is
open); the subscriptions only *nudge*, they do not force a derived value.

### Components (`src/ui-jsx/panels/chat/`)

Each is a small, focused function component. All state reads go through
`useSlice`; all mutations go through `store.dispatch` of existing actions.

1. **`Chat.tsx`** — the chat shell.
   - Resolves the visible chat: `useSlice(s => activeSavedChat(s.chat))` (id +
     message-id sequence as the re-render key).
   - Renders: `<ChatHeader>`, a scrollable message list (`flex-direction:
     column-reverse`, built in source order then reversed), `<ChatInput>`, and —
     when `chat.type === "refine"` — `<RefineCommitBar>`.
   - When `showSessions` (local state) is on, renders `<Sessions>` instead of the
     header+list+input.
   - Empty state (no visible chat): render nothing / a placeholder.

2. **`ChatHeader.tsx`** — renders `spec.headerControls(chat, ctx)` by `kind`:
   - `backButton` → `onBack` (return to Story Engine tab without ending the
     session).
   - `label` → bold title text.
   - `sessionsButton` → toggles the shell's `showSessions`.
   - `newChatButton` → `chatCreated` with a fresh **brainstorm** chat (the
     default type; matches SUI's "new chat" behavior).
   - `subModeToggle` → `subModeChanged` (brainstorm cowriter/critic).
   - `phaseIndicator` / `scrubIndicator` → **omitted in Slice A** (forge-only).

3. **`Message.tsx`** — one bubble.
   - Role-styled container (user: right-aligned, blue tint, `12px 12px 0 12px`;
     assistant: left, white 5% tint, `12px 12px 12px 0`; system: centered,
     dashed border, italic, dimmed).
   - Editable body: reuse the uncontrolled-textarea edit pattern from Foundation
     (seed via child text, track via `onInput`, commit → `messageUpdated`).
     Click-to-edit; Save/Cancel affordance consistent with Foundation's editor.
   - Controls: retry (`uiChatRetryGeneration`) for assistant, delete
     (`messageRemoved`) for all; system messages get delete only.
   - Live streaming: `useSlice` on this message's `content` so appended tokens
     re-render the bubble.
   - System "Context" bubble (`messageKind`/role system): collapsed by default
     with an expandable header labelled "Context".

4. **`ChatInput.tsx`** — the composer.
   - Textarea + Send button + optional Clear button, styled from theme tokens.
   - Reads spec input customization for the active chat: `inputPlaceholder`,
     `sendLabel` (default "Send"), `showClearButton`, `onClear`.
   - Send → dispatch the existing `uiChatSubmitUserMessage` effect action (which
     reads the input value, so the input writes its current text where that
     effect expects it — see "Input value handoff" below).
   - Clear → spec `onClear` if present, else clear the composer.

5. **`Sessions.tsx`** — in-panel chat list.
   - `useSlice(s => s.chat.chats)` + `activeChatId`.
   - Rows: each chat's title, active marker, and switch (`chatSwitched`),
     rename (`chatRenamed`), delete (`chatDeleted`) affordances; a **New**
     control (`chatCreated` with a fresh brainstorm chat). A **Back** control
     returns to the chat view
     (`showSessions = false`).

6. **`RefineCommitBar.tsx`** — Commit (`uiChatRefineCommitted`) / Discard
   (`uiChatRefineDiscarded`). Shown only for refine chats.

### Refine wiring from the JSX Foundation

`Foundation.tsx`'s Generate (zap) handler changes from generate-only to
**adaptive**, factored into a shared helper so ATTG and Style share one code path
(per CLAUDE.md "push the difference into the leaf"):

```
onZap(fieldId):
  const text = committed field value (from store)
  if text.trim() is empty:  dispatch(<field>GenerationRequested())
  else:                     dispatch(uiChatRefineRequested({ fieldId, sourceText: text }))
```

The existing effect creates the refine chat, seeds its `refineSource` context
message, and dispatches `chatCreated`; the shell subscription switches to the
Chat tab. On Commit, the refine spec's `onCommit` writes the chosen text back to
the field; the subscription returns to Story Engine. No core change — only the
leaf click handler.

### Input value handoff

The SUI `uiChatSubmitUserMessage` effect reads the composer's current value at
send time. Mirror whatever contract that effect expects: the JSX `ChatInput`
holds the draft (local state) and provides it to the effect the same way SUI
does (e.g. via the storyStorage slot the effect reads, or by passing the value
in the action payload — match the existing effect signature exactly). Confirm the
effect's read path during implementation and wire `ChatInput` to it; do **not**
change the effect.

## Data flow

```
send:   ChatInput → uiChatSubmitUserMessage → spec.handleSend / chat-strategy
        → GenX → messageAppended (stream) → useSlice → bubble re-renders
refine: Foundation zap (non-empty) → uiChatRefineRequested → effect creates
        refine chat + seeds context → chatCreated → shell subscription → Chat tab
commit: RefineCommitBar → uiChatRefineCommitted → spec.onCommit writes field
        → shell subscription → Story Engine tab
```

## Testing

- **Unit (vitest):** the adaptive field-action helper — empty → generate action;
  non-empty → `uiChatRefineRequested` with trimmed `sourceText`; whitespace-only
  treated as empty. A sessions-list ordering/active-marking helper if any pure
  logic is extracted. (`useSlice` bridge already covered by existing tests.)
- **Manual parity (Chrome ext, story `jsx-rewrite`):**
  1. Brainstorm: send a message, watch it stream; edit / retry / delete a
     message.
  2. Sessions: New, switch, rename, delete; active marker correct.
  3. Refine: from a JSX Foundation field with content, click zap → Chat tab
     opens with the seeded context → send a change → assistant rewrite streams →
     Commit writes the field and returns to Story Engine; repeat and Discard
     drops it.
  4. Side-by-side against the SUI Chat tab for visual + behavioral parity.
- No `core/` changes → existing 384 tests stay green.

## Out of scope (later slices)

- **Forge in chat** (Slice B): `forgeSegments` chip rendering, inline
  `SeEntityCard` draft cards, `ForgeCommitBar`, phase/scrub indicators.
- The `SeEntityCard` port (shared with the World tab).
- Markdown rendering (messages stay editable plain text, matching SUI).
- Summary chat UI polish beyond what the generic shell provides.
- JSX modal/portal infrastructure (sessions is in-panel).

## Risks / notes

- **Column-reverse scroll**: the list uses `flex-direction: column-reverse` so
  new messages pin to the bottom without scroll math (as SUI does). Verify it
  behaves inside the JSX shadow tree during the parity check.
- **Editable bubble vs streaming**: the uncontrolled-textarea seed (child text,
  not `value`) means editing a bubble *while* a stream lands on it is an edge
  case. SUI avoids it because streaming turns aren't in edit mode; we mirror that
  — edit mode is user-initiated and streaming targets non-edited bubbles.
- **Input handoff** is the one integration detail to pin down against the
  existing effect; get it right rather than reshaping the effect.
- **`subModeToggle`** is a pure leaf control dispatching `subModeChanged`.
