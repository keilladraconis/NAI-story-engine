# Typed Chat System — Restoring Refine, Generalizing Brainstorm

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-05-05.
**Target version:** 0.12.0 (alpha minor — schema-changing).

## Problem

Two pressures converge:

1. **Users miss field-level Refine.** Up through 0.5.x every Story Engine field with a generate button also had a Refine surface — type instructions, click Refine, the LLM rewrote the field with the changes. The 0.7+ rewrites kept Refine alive only on lorebook entries. Users have asked for it back on Foundation Intent, Style, ATTG, Story Contract, etc.
2. **Brainstorm wants to grow.** The current Brainstorm panel hardcodes one chat behavior with a `cowriter | critic` toggle and a one-shot summarize button. The vision is broader: chat sessions that are "typed" — brainstorm, summary, refine, plot-crafter, etc. — each with its own prompts, lifecycle, and context-projection rules.

These pressures share a solution: a typed-chat system where each chat type is a registry-defined module, and Refine is one of those types — surfaced as a per-field button pair that opens a refine chat scoped to that field.

## Non-goals (v1)

- Script-messaging integration (`api.v1.messaging`). The chat-type contract is general enough to absorb this later.
- Plot-crafter, brainstorm-partner, or other speculative chat types as standalone modules. The architecture supports adding them; v1 ships with `brainstorm`, `summary`, `refine`.
- Forge integration of the refine pair. Forge's command-loop needs separate design work.
- Refining a refine (no nesting).
- Auto-commit on close. Manual commit / discard-on-abandon only.
- Reactive disabled state on the refine button. Static presentation; click handler bails on empty input.

## Architecture

### Module layout

```
src/core/chat-types/
  index.ts           — registers all types; exports getChatTypeSpec(id)
  types.ts           — ChatTypeSpec interface, Chat, ChatLifecycle, RefineContext, ChatSeed
  brainstorm.ts      — brainstorm spec (subModes: cowriter | critic)
  summary.ts         — summary spec (seedFrom: brainstorm chat OR story-text source)
  refine.ts          — refine spec (commit-discard, owns refineContext shape)

src/core/store/slices/
  chat.ts            — replaces brainstorm.ts; one slice for all saved chats + refine slot

src/core/store/effects/
  chat-effects.ts    — replaces brainstorm-effects.ts
                       handles submit, retry, edit, commit/discard via spec dispatch
  handlers/chat.ts   — completion + chunk handlers (replaces handlers/brainstorm.ts)

src/core/utils/
  refine-strategy.ts          — buildRefineMessages(spec, fieldStrategy, refineCtx)
                                wraps any field-generate strategy with a refine tail
  field-strategy-registry.ts  — central FIELD_STRATEGIES record mapping fieldId → factory
  context-builder.ts          — buildStoryEnginePrefix asks active chat's spec for
                                contextSlice() instead of reading brainstorm slice directly

src/ui/components/
  ChatPanel.ts       — replaces BrainstormPane; reads active chat's spec for
                       header/input/transcript rendering; resolves visible chat as
                       refineChat ?? activeChat
  ChatHeader.ts      — replaces SeChatHeader; spec-driven controls
  SeGenRefinePair.ts — drop-in pair of [generate-icon | refine-icon]
                       opens refine chat for a target field
  RefineCommitBar.ts — Commit/Discard footer shown when refineChat is non-null
```

**Removed in this PR:** `slices/brainstorm.ts`, `effects/brainstorm-effects.ts`, `handlers/brainstorm.ts`, `BrainstormPane`, `SeChatHeader`, the `lorebookRefine` request type, the `brainstorm` standalone request type. Their behavior either folds into the new chat infrastructure or migrates by spec.

### `ChatTypeSpec` contract

```ts
export type ChatLifecycle = "save" | "commit-discard";

export interface RefineContext {
  fieldId: string;
  currentText: string;
  history: ChatMessage[];   // user/assistant turns from the refine chat
}

export interface ChatSeed {
  kind: "blank" | "fromChat" | "fromStoryText" | "fromField";
  sourceChatId?: string;    // if kind === "fromChat"
  sourceText?: string;      // if kind === "fromStoryText" | "fromField"
  sourceFieldId?: string;   // if kind === "fromField" (refine target)
}

export interface ChatTypeSpec<SubMode extends string = string> {
  id: string;                          // "brainstorm" | "summary" | "refine"
  displayName: string;
  lifecycle: ChatLifecycle;
  subModes?: readonly SubMode[];
  defaultSubMode?: SubMode;

  initialize(seed: ChatSeed, ctx: SpecCtx): {
    title: string;
    initialMessages: ChatMessage[];
    subMode?: SubMode;
  };

  systemPromptFor(chat: Chat, ctx: SpecCtx): string;
  prefillFor?(chat: Chat, ctx: SpecCtx): string | undefined;

  /** Project this chat's transcript into messages that buildStoryEnginePrefix
   *  injects when this chat is the active saved chat. Refine returns []. */
  contextSlice(chat: Chat, ctx: SpecCtx): ChatMessage[];

  /** Header UI controls the ChatHeader composes for this type. */
  headerControls(chat: Chat, ctx: SpecCtx): HeaderControl[];

  onCommit?(chat: Chat, ctx: SpecCtx): void;
  onDiscard?(chat: Chat, ctx: SpecCtx): void;
}
```

`SpecCtx` carries `getState`, `dispatch`, and the field-strategy registry. Specs never reach for the store singleton.

### State shape

```ts
export type ChatMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** Set on assistant messages produced inside a refine chat — these are
   *  the candidate rewrites. The most recent is what Commit overwrites with. */
  refineCandidate?: boolean;
}

export interface Chat {
  id: string;
  type: string;                  // ChatTypeSpec.id
  title: string;
  subMode?: string;
  messages: ChatMessage[];
  seed: ChatSeed;
  /** Only set for refine chats; describes commit target. */
  refineTarget?: { fieldId: string; originalText: string };
}

export interface ChatSliceState {
  chats: Chat[];                 // saved chats only (brainstorm, summary)
  activeChatId: string | null;
  refineChat: Chat | null;       // single slot — never accumulates
}
```

Refine occupies a dedicated single slot, never enters `chats[]`. The session modal renders `state.chats` with no filtering. The chat panel resolves the visible chat as `refineChat ?? chats.find(c => c.id === activeChatId)`.

**Initial state.** A fresh story (or a story whose persisted state contains neither `brainstorm` nor `chat` keys) initializes with one default brainstorm chat:

```ts
const defaultChat: Chat = {
  id: api.v1.uuid(),
  type: "brainstorm",
  title: "Brainstorm 1",
  subMode: "cowriter",
  messages: [],
  seed: { kind: "blank" },
};
const initialChatSliceState: ChatSliceState = {
  chats: [defaultChat],
  activeChatId: defaultChat.id,
  refineChat: null,
};
```

This matches v0.11.x behavior (a freshly opened story always has Brainstorm 1 ready to use) and keeps `activeChatId` non-null in the steady state.

### Per-type behaviors at a glance

| Spec | Lifecycle | Sub-modes | Saved? | `contextSlice` | Notes |
|---|---|---|---|---|---|
| `brainstorm` | save | cowriter, critic | yes | full transcript | sub-mode swaps system prompt + prefill only |
| `summary` | save | none | yes | last assistant turn | seed: `fromChat` or `fromStoryText`; iterable |
| `refine` | commit-discard | none | no | `[]` (never reaches prefix) | single slot; bound to a field |

## UI surfaces & flows

### `ChatPanel`

Single host for whichever chat is currently rendered.

```
visibleChat = refineChat ?? chats.find(c => c.id === activeChatId)
spec = registry[visibleChat.type]
```

Composition:

1. `ChatHeader` — always visible, content driven by `spec.headerControls(chat, ctx)`.
   - Brainstorm: session-modal button, sub-mode toggle (Co/Crit), "Sum" button.
   - Summary: session-modal button, source label ("from Brainstorm 3").
   - Refine: target-field label ("Refining: Intent"), no session-modal button.
2. Transcript list (column-reverse, same as today).
3. Footer:
   - Saved chats: `SeBrainstormInput` (text input + send).
   - Refine: `SeBrainstormInput` plus a `RefineCommitBar` row with **Commit** and **Discard**.

`StoreWatcher` rebuild trigger watches `(refineChat?.id, activeChatId, visibleChat.messages.map(m=>m.id))` so the panel rebuilds when the user enters or leaves a refine, switches sessions, or the message list changes structurally.

### `SeGenRefinePair`

Drop-in row with two icon buttons. Always-static presentation — no reactive disabled state.

```ts
{
  fieldId: string;
  generateRequestId?: string;
  generateAction: { type, payload } | () => void;
  refineSourceText: () => string;   // empty result triggers no-op + toast
}
```

Uses feather `IconId` values from `external/script-types.d.ts`. The exact icon names will be confirmed during implementation; expectation is `zap` for generate (matches existing buttons) and an `edit-*` family icon for refine.

Refine click handler:

```ts
const text = refineSourceText().trim();
if (!text) {
  api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
  return;
}
store.dispatch(chatRefineRequested({ fieldId, sourceText: text }));
```

### v1 surfacing inventory

`SeGenRefinePair` is dropped in:

- Foundation: Intent, Style, Story Contract REQUIRED, Story Contract PROHIBITED, Story Contract EMPHASIS, ATTG.
- Lorebook: Content, Keys (replaces the existing instructions-input + Refine button row inside `SeLorebookContentPane`).
- Forge: skipped for v1.

Brainstorm summary commit target — N/A; summaries are now their own chat type.

### User flow — refine

1. User clicks the refine icon next to Intent. `chatRefineRequested` fires with `{ fieldId: "intent", sourceText }`.
2. If `refineChat !== null`, the effect bails with toast "Finish or discard the current refine first" and ensures the panel is open on the in-flight refine.
3. Otherwise: chat-effects creates a new refine chat `{ type: "refine", refineTarget: { fieldId, originalText: sourceText }, ... }` and writes it to `state.chat.refineChat`. Sidebar auto-opens to chat panel if collapsed.
4. Chat panel shows refine header ("Refining: Intent"), an empty transcript, and the Commit/Discard footer.
5. User types instructions. Send fires `messageSubmitted`. Chat-effects builds the request via the refine spec — which calls into `FIELD_STRATEGIES["intent"](getState, { refineContext: { fieldId, currentText, history } })`. The field strategy emits its normal SE prefix; `refine-strategy.ts` appends the refine tail.
6. Streamed assistant response appears as a candidate (`refineCandidate: true`). User can iterate ("shorter," "lean noir") — each assistant turn is another candidate.
7. **Commit** dispatches `chatRefineCommitted`: the spec's `onCommit` writes `latestCandidate.content` to the field via the field's normal set-action; `refineChatCleared` nulls the slot.
8. **Discard** at any time dispatches `chatRefineDiscarded`: cancels any in-flight request, then `refineChatCleared`. Source field untouched.
9. Commit button no-ops if there is no candidate yet (zero assistant messages with content). Better than reactive greying.

Source field stays editable behind the refine chat. If the user edits the source while refining, the refine continues against `refineTarget.originalText` (snapshot at refine open). On commit, the field is overwritten regardless of intervening edits — this matches "explicit commit, manual user intent."

### User flow — summary creation

1. From a brainstorm chat, user clicks **Sum** in the header.
2. `chatSummaryRequested({ seed: { kind: "fromChat", sourceChatId: brainstorm.id } })` fires.
3. Chat-effects creates a new chat via `summarySpec.initialize(seed, ctx)` — populates initial messages by injecting the brainstorm transcript plus a system "summarize" instruction. The new chat is appended to `chats[]` and `activeChatId` is set to it.
4. The first auto-send produces the dense present-tense summary. User iterates with ordinary chat input.
5. To target story text instead, a separate entry point fires `chatSummaryRequested({ seed: { kind: "fromStoryText", sourceText } })`. Exact placement of that entry point is an implementation detail surfaced in the implementation plan.

### User flow — brainstorm

Unchanged from today's UX. Submit / edit / retry / sub-mode toggle / sessions / Sum behave the same. Underneath, the brainstorm spec drives everything that used to be hardcoded.

## Generation wiring

### Request types

- **Drop:** standalone `brainstorm` and `lorebookRefine` request types.
- **Add:** `chat` request type with payload `{ chatId, requestId }`. The chat-effects layer reads the chat, looks up its spec, and assembles the strategy from there.
- **Keep unchanged:** all per-field generate request types (`intent`, `attg`, `style`, etc.). Refine doesn't add a new per-field type.

### Strategy factory contract

Every existing field-generate strategy factory grows one optional knob:

```ts
buildIntentStrategy(
  getState,
  opts?: { refineContext?: RefineContext },
): GenerationStrategy
```

When `opts.refineContext` is present, the factory's `messageFactory` (still JIT) emits its normal prefix messages, then `refine-strategy.ts` decorates the tail:

```
[ ...prefixMessages,
  ...refineTail(refineContext, refineSpec) ]
```

`refineTail` owns the refine-instruction system message and the prefill policy, both sourced from the `refine` chat-type spec. Field factories never know they're being refined — they hand back their normal prefix and let the tail decorate.

### Field-strategy registry

```ts
// src/core/utils/field-strategy-registry.ts
export type FieldStrategyFactory = (
  getState: () => RootState,
  opts?: { refineContext?: RefineContext },
) => GenerationStrategy;

export const FIELD_STRATEGIES: Record<string, FieldStrategyFactory> = {
  intent: buildIntentStrategy,
  attg: buildAttgStrategy,
  style: buildStyleStrategy,
  contractRequired: buildContractRequiredStrategy,
  contractProhibited: buildContractProhibitedStrategy,
  contractEmphasis: buildContractEmphasisStrategy,
  lorebookContent: buildLorebookContentFactory,
  lorebookKeys: buildLorebookKeysFactory,
};
```

If a `fieldId` has no entry, the refine effect toasts "Refine not available for this field" and clears the slot. Defensive only — should never fire with the v1 surfacing inventory.

### `buildStoryEnginePrefix` rewire

Today the prefix reads `state.brainstorm` directly. After refactor, it asks the chat slice for the active *saved* chat (refine never participates), then calls `spec.contextSlice(activeChat, ctx)`:

```ts
function buildStoryEnginePrefix(getState, opts): Message[] {
  // ...
  const { chats, activeChatId } = getState().chat;
  const active = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  if (active) {
    const spec = getChatTypeSpec(active.type);
    const sliced = spec.contextSlice(active, ctx);
    // append sliced into the brainstorm-context section
  }
}
```

`contextSlice` projections per spec: brainstorm = full transcript, summary = last assistant turn, refine = `[]`. Refine chats never reach this code path because they live in `refineChat` (a separate slot), not in `chats[]`.

## Migration

`src/index.ts` runs a one-shot migration during persisted-data hydration, before the first store dispatch:

```ts
const persisted = await api.v1.storyStorage.get("kse-persist");
if (persisted?.brainstorm && !persisted.chat) {
  persisted.chat = {
    chats: persisted.brainstorm.chats.map((c) => ({
      id: c.id,
      type: "brainstorm",
      title: c.title,
      subMode: c.mode,           // "cowriter" | "critic" → subMode
      messages: c.messages,
      seed: { kind: "blank" },
    })),
    activeChatId:
      persisted.brainstorm.chats[persisted.brainstorm.currentChatIndex]?.id ?? null,
    refineChat: null,
  };
  delete persisted.brainstorm;
  await api.v1.storyStorage.set("kse-persist", persisted);
  api.v1.ui.toast("Brainstorm chats migrated to new chat system.", { type: "info" });
}
```

Idempotent — the `!persisted.chat` guard prevents double-migration. If migration throws, the catch logs the error, leaves persisted state untouched, toasts "Brainstorm migration failed; please report — your data is intact." Users keep their data; recovery is a future patch.

This trades against the alpha rule "don't worry about data migration" because users have specifically reported brainstorm data loss as friction. Preserving sessions through this rewrite is worth the small migration block.

## Error handling

- **Refine for an unregistered fieldId.** Toast "Refine not available for this field"; clear `refineChat`. Logged via `api.v1.log`.
- **Refine source text empty at click time.** Toast in click handler, no dispatch. No reactive disabled state.
- **Refine commit with no candidate yet.** Commit button no-ops silently.
- **Refine collision (click while refine in flight).** Toast "Finish or discard the current refine first." Panel surfaces in-flight refine.
- **Spec lookup miss.** `getChatTypeSpec(unknownId)` throws. This is a programming error (chat in state with no registered type), surfaced loudly during dev/test. No production fallback.
- **Cancellation during refine streaming.** Effects layer removes the partial candidate message and leaves the refine chat alive. User can resend.
- **Migration failure.** Catch logs, persisted state untouched, recovery toast shown.

## Testing

Mirroring existing test layout under `tests/`:

- `tests/core/store/slices/chat.test.ts` — slice reducers, refine create/commit/discard flows, migration from old brainstorm shape, single-slot enforcement.
- `tests/core/chat-types/brainstorm.test.ts`, `summary.test.ts`, `refine.test.ts` — spec behaviors in isolation: `initialize`, `systemPromptFor`, `contextSlice`, sub-mode prompt switching.
- `tests/core/utils/refine-strategy.test.ts` — refine tail composition over each field's prefix; assertion: every registered field factory accepts `refineContext` without throwing and emits a tail when present.
- `tests/core/store/effects/chat-effects.test.ts` — submit/edit/retry/commit/discard dispatch flow; cancellation cleanup; collision-blocking.

## Acceptance criteria

1. Existing brainstorm sessions migrate cleanly. Old chats appear in the new session list. Sub-mode is preserved. No data loss.
2. Brainstorm UX matches v0.11.x feature-for-feature: send/edit/retry/clear, sessions modal, sub-mode toggle, "Sum" button.
3. "Sum" creates a new `summary` chat seeded from the source brainstorm. The summary chat is iterable and saved in the session list.
4. Foundation Intent, Style, ATTG, Story Contract REQUIRED/PROHIBITED/EMPHASIS, lorebook Content all expose `SeGenRefinePair`.
5. Clicking refine on any of the above opens the chat panel into a refine session bound to that field. Iterating produces candidate rewrites. Commit overwrites the field; Discard reverts.
6. Refine sessions never appear in the session list, occupy at most a single state slot at any time, and are cleared from state on commit or discard.
7. The active *saved* chat (brainstorm or summary) drives the brainstorm-context slot in `buildStoryEnginePrefix` via its spec's `contextSlice`. Refine sessions are invisible to SE generation context.
8. The refine button uses static presentation — no reactive disabled state — and bails with a toast when source text is empty.
9. All test suites referenced under "Testing" pass.
10. The old `lorebookRefine` request type, `BrainstormPane`, `SeChatHeader`, and the brainstorm slice file are removed from the tree.

## Rollout

- Single PR, version bump `0.11.x → 0.12.0` (alpha minor — schema-changing).
- CHANGELOG entries:
  - `### Added`: typed chat system, field-level Refine restored on Foundation/ATTG/Style/Story Contract/lorebook fields, summaries as iterable chat type.
  - `### Changed`: Brainstorm reframed as one chat type among several; sub-mode toggle preserved.
  - `### Removed`: old `brainstorm` slice and surrounding effects/handlers/UI; standalone `lorebookRefine` request type.
  - `### Migration`: one-shot auto-migration of v0.11 brainstorm sessions on first load.
- `story_engine_debug` log records what migrated.

## Out of scope (explicit deferrals)

- `api.v1.messaging` integration. Spec contract is general enough to absorb a future `external-collaborator` type.
- Plot-crafter, brainstorm-partner, rewriter-as-distinct-from-refine specs.
- Forge integration of `SeGenRefinePair`.
- Nested refine (refine inside a refine).
- Auto-commit on close.
