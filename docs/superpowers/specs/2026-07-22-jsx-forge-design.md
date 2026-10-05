# JSX Forge

**Date:** 2026-07-22
**Status:** Approved (design)
**Branch:** v14

## Context

The JSX Story Engine has Foundation, World, and Chat (brainstorm/refine) but no
**Forge**. Forge is a chat type (`forge`) that is already fully wired into the
shared chat engine — send routing (`ChatInput` calls `spec.handleSend`), phases
(`chat.subMode` = sketch/expand/weave), inline-entity resolution
(`spec.inlineEntityIdsFor`), and cast/discard-all all exist and work through the
SUI panel. This slice is **JSX presentation** of that existing machinery, plus
**one small backend addition**: a user-settable "next phase" pin so the phase
indicator can be interactive.

The JSX `ChatHeader` was pre-staged for this: its control switch already has a
`default` case noting `phaseIndicator, scrubIndicator (forge — Slice B)`.

## Goals

- Open/resume a forge session from a JSX **Forge section** in the Story Engine tab.
- Render forge chats in the Chat tab: an **interactive phase indicator**, a
  **scrub indicator**, **inline draft-entity cards** under each forge turn, and a
  **Commit/Discard** bar.
- Make the phase indicator show *the phase that will fire next* and let the user
  **pin** it; auto-advance remains the default when the user doesn't interact.

## Non-Goals

- Changing forge generation, prompts, or the phase/scrub mechanics beyond the pin.
- Removing the SUI forge UI.

## Backend — next-phase pin (small)

Today the continue effect (`forge-chat-effects.ts` ~L300–308) computes the target
phase as: `!advance ? subMode : pool.length === 0 ? "sketch" : nextPhase(subMode)`
and dispatches `subModeChanged`. There is no way to persist a user's phase choice
between the click and the next send. Add a per-chat pin:

- **`forge` slice** (`slices/forge.ts`): add
  `pinnedNextPhaseByChatId: Record<string, "sketch" | "expand" | "weave">` to
  state + initial. Actions:
  - `forgeNextPhasePinned({ chatId, phase })` — set the key.
  - `forgeNextPhaseCleared({ chatId })` — delete the key (guard: no-op if absent).
  Export both.
- **Continue effect** (`forge-chat-effects.ts`): read
  `const pinned = state.forge.pinnedNextPhaseByChatId[chatId];` and change the
  advancing branch to `pool.length === 0 ? "sketch" : (pinned ?? nextPhase(chat.subMode))`
  — **pool-empty→sketch still wins over the pin** (user's chosen safety rule).
  After computing `target`, consume the pin one-shot: `if (pinned) dispatch(forgeNextPhaseCleared({ chatId }));`
- **`closeForgeSession`** (L177): add `dispatch(forgeNextPhaseCleared({ chatId }));`
  alongside the existing scrub/tombstone clears.
- **Selectors** (`selectors/forge.ts`):
  - `selectForgeNextPhase(state, chatId): "sketch" | "expand" | "weave"` —
    the phase that will fire next: `poolCount === 0 ? "sketch" : (pinned ?? nextPhase(subMode))`.
    Reimplement the 3-line `nextPhase` and the pool count inline (selectors stay
    effect-free; do not import from `effects/`).
  - `selectForgeDraftPoolCount(state, chatId): number` — count of
    `lifecycle === "draft" && sourceChatId === chatId` entities. Drives pill
    enablement (Expand/Weave disabled while 0).

`nextPhase` mapping (mirror the effect): sketch→expand, expand→weave, weave→sketch.

## UI

### Phase + scrub indicators — `ChatHeader.tsx`

Add two cases to the existing control switch:

- **`case "phaseIndicator"`**: a three-pill row **Sketch · Expand · Weave**.
  The pill matching the "will fire next" phase is highlighted. When the pool is
  empty, only Sketch is active; Expand/Weave are dimmed + non-interactive (can't
  pin what can't fire). Clicking an enabled pill dispatches
  `forgeNextPhasePinned({ chatId: chat.id, phase })`.

  **Hook placement**: ChatHeader guards with `if (!stamp) return null` before the
  `chat` variable is resolved, so the new `useSlice` reads must precede that guard
  and **resolve the active chat internally** (via `activeSavedChat`), not via the
  later `chat` variable:
  ```ts
  const nextPhase = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? selectForgeNextPhase(s, c.id) : "sketch";
  });
  const forgePoolEmpty = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? selectForgeDraftPoolCount(s, c.id) === 0 : true;
  });
  const scrubbing = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return !!c && (s.forge.pendingScrubByChatId[c.id]?.length ?? 0) > 0;
  });
  ```
  These sit with the existing `stamp` useSlice (all before the early return), and
  are consumed only inside the `phaseIndicator` / `scrubIndicator` cases.
- **`case "scrubIndicator"`**: when `scrubbing` (the useSlice read above), show a
  small italic "scrubbing…" hint; otherwise render nothing.

### Inline draft-entity cards — `Message.tsx` (+ `Chat.tsx`)

- `MessageList` (in `Chat.tsx`) passes the resolved `chat` to `<Message>`
  (new prop `chat`).
- `Message` computes the inline ids reactively as a **primitive** (join key, to
  respect the `useSlice` stable-return rule):
  ```ts
  const inlineKey = useSlice((s) => {
    const spec = getChatTypeSpec(chat.type);
    return (spec.inlineEntityIdsFor?.(message, chat, { getState: () => s, dispatch: store.dispatch }) ?? []).join(",");
  });
  const inlineIds = inlineKey ? inlineKey.split(",") : [];
  ```
  Render an `<EntityCard entityId={id} />` for each id **beneath the assistant
  bubble** (inside the assistant row, keyed `` `inline-${message.id}-${id}` ``).
  Non-forge chats return `[]` (no `inlineEntityIdsFor`), so this is inert for
  brainstorm/refine. `EntityCard` already renders draft cards with a discard
  button — reuse as-is.

### ForgeCommitBar — new `ForgeCommitBar.tsx` (+ `Chat.tsx`)

Mirror `RefineCommitBar`. Props `{ onEnd: () => void }`.

- **Commit**: enabled when `selectForgeDraftPoolCount(state, chat.id) >= 1`;
  dispatches `forgeCastAllRequested({ chatId })`, then `onEnd()`.
- **Discard**: always enabled; dispatches `forgeDiscardAllRequested({ chatId })`,
  then `onEnd()`.
- Both actions end the session (delete the chat) in the effect layer; `onEnd`
  returns the user to the Story Engine tab.
- `Chat.tsx`: render `<ForgeCommitBar onEnd={props.onBack} />` when
  `chat.type === "forge"` (alongside the existing `chat.type === "refine"` bar).
  Resolve the active chat at click time (store.getState) like RefineCommitBar.

### Forge entry section — new `ForgeSection.tsx` (+ `StoryEngine.tsx`, `App.tsx`)

- A section titled **Forge** with a **guidance `<textarea>`**
  (`storageKey: "story:se-forge-guidance"`; bare key constant `"se-forge-guidance"`,
  matching SUI `STORAGE_KEYS.FORGE_GUIDANCE_UI`) and a **Forge** button.
- Button behavior (mirror `SeForgeSection`):
  ```ts
  const guidance = (await api.v1.storyStorage.get("se-forge-guidance")) as string || "";
  const activeId = selectActiveForgeChatId(store.getState());
  if (activeId) {
    store.dispatch(chatSwitched({ id: activeId }));
    if (guidance.trim()) {
      const chat = store.getState().chat.chats.find((c) => c.id === activeId);
      if (chat) getChatTypeSpec("forge").handleSend?.(chat, guidance, { getState: store.getState, dispatch: store.dispatch });
    }
  } else {
    store.dispatch(forgeChatNewSessionRequested({ initialUserMessage: guidance }));
  }
  if (guidance.trim()) await api.v1.storyStorage.remove("se-forge-guidance");
  ```
- `StoryEngine.tsx`: render `<ForgeSection />` between `<Foundation />` and
  `<World />` (matches SUI ForgePane order).
- `App.tsx`: extend the existing refine tab-switch effect to also switch to the
  Chat tab when a **forge** chat is created or switched to (so opening Forge from
  the Story Engine surfaces the chat), mirroring the `type === "refine"` branches.

## Tasks

1. **Backend: next-phase pin** — forge slice field + actions, continue-effect
   honor/consume, `closeForgeSession` clear, `selectForgeNextPhase` +
   `selectForgeDraftPoolCount`. Tests.
2. **Phase + scrub indicators** — ChatHeader `phaseIndicator` (interactive pills)
   + `scrubIndicator`.
3. **Inline draft-entity cards** — Message (+ Chat passes `chat`).
4. **ForgeCommitBar** — new bar + Chat wiring (forge type, return to engine).
5. **Forge entry section** — ForgeSection + StoryEngine placement + App forge
   tab-switch.

## Testing

- **Task 1** (unit): forge slice pin set/clear; continue effect honors the pin,
  consumes it, and pool-empty overrides it (fires sketch); `selectForgeNextPhase`
  (pool empty → sketch; pool non-empty → pin ?? nextPhase(subMode));
  `selectForgeDraftPoolCount`.
- **Tasks 2–5**: tsc-gated + the whole-slice live-verify.
- **Live-verify** (on the **Story Engine (JSX)** tab — confirm icon-only S.E.G.A.):
  open Forge with guidance → forge chat appears with the phase bar; Forge Ahead
  runs sketch, draft cards appear inline under the turn; the phase bar shows the
  next phase and auto-advances; pin a phase → next Forge Ahead runs it; discard a
  draft from its inline card; Commit casts all drafts to live and returns to the
  Story Engine; Discard ends the session.

## Risks / Notes

- **Pure presentation except the pin** — no changes to forge generation/prompts.
- **Pin is one-shot**: consumed on each advancing continue; cleared on session
  end. Pool-empty→sketch always wins, and Expand/Weave pills are disabled while
  the pool is empty, so a pin can only be set when it can actually fire.
- **`useSlice` returns primitives**: inline ids via a join-key string; phase via
  a string; pool-empty via a boolean — no fresh-object selector loops.
- **Hooks unconditional**: ChatHeader's new `useSlice` reads sit at the top of
  the component (not inside the `phaseIndicator` case), used only when that pill
  renders.
- **Inline cards inert for non-forge chats** (no `inlineEntityIdsFor`), so
  brainstorm/refine are unaffected.
