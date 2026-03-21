# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NAI Story Engine is a NovelAI script (.naiscript) that guides structured worldbuilding through an 8-stage pipeline: brainstorming → story prompt → world snapshot → World Entries (Characters, Systems, Locations, Factions, Situational Dynamics, Topics). Runs in NovelAI's web worker environment (QuickJS, no DOM).

## Commands

```
npm run build      # nibs build → dist/NAI-story-engine.naiscript
npm run test       # vitest run
```

## Architecture

**Entry point:** `src/index.ts` — initializes GenX, registers store effects, loads persisted data, mounts UI extensions.

**Three custom frameworks in `lib/` (treat as read-only):**

- `nai-store.ts` — Redux-like store with `createSlice`, `dispatch`, `useSelector`, `subscribeEffect`
- `nai-act.ts` — Component framework with `describe()` (static structure) + `onMount()` (reactive subscriptions)
- `gen-x.ts` — Generation queue engine with budget management and pub/sub state updates

**State (`src/core/store/`):**

- `slices/story.ts` — Field contents and World Entry items
- `slices/brainstorm.ts` — Chat messages
- `slices/ui.ts` — Edit modes, temporary inputs
- `slices/runtime.ts` — Generation queue status, GenX state
- `effects.ts` — Side effects triggered by state changes
- Data persisted via `api.v1.storyStorage` under key `"kse-persist"`

**Config:** `src/config/field-definitions.ts` — `FIELD_CONFIGS` array defines all field metadata, layouts, and generation prompts. Uses `FieldID` enum throughout.

**UI (`src/ui/`):**

- Components follow nai-act pattern: static `describe()` returns UIPart tree, `onMount()` sets up reactive subscriptions via `ctx.useSelector()`
- Non-storageKey UI mutations use `api.v1.ui.updateParts()` — never re-render. storageKey-bound inputs are the exception: update them via storyStorage, not updateParts (see UI Input Patterns below).
- Element IDs centralized in `src/ui/framework/ids.ts` with prefixes: `se-` (story engine), `se-bs-` (brainstorm), `kse-` (storage keys)
- `src/core/utils/context-builder.ts` — Builds layered AI prompts from current state

**Prompts:** Configurable via `project.yaml` config fields (system prompt, brainstorm, world snapshot, lorebook generation, ATTG, style, etc.).

**Prompt configuration policy — prompts belong in `project.yaml`, not in code.** NovelAI exposes `project.yaml` config fields as a user-editable settings panel. Generation prompts must live there so users can tune them without touching the script. The rule:

- Every generation prompt (system identity, shape, intent, world state, forge, lorebook, ATTG, style, brainstorm, etc.) must be a `type: string, multiline: true` config field in `project.yaml` with a solid default.
- Read at JIT time via `api.v1.config.get("field_name")` inside the message factory — never at module load time.
- **Never hardcode a prompt as a string literal in a strategy or effect file.** If you find a hardcoded prompt, move it to `project.yaml`. Fallback to `""` is acceptable; the prompt author is responsible for providing a non-empty default in the yaml.
- Before adding a new config field, check whether an existing field already covers the use case. Prompts often survive feature renames (e.g. `crucible_shape_prompt` is still the right key for Foundation shape generation). Duplicate config fields that say the same thing are worse than reusing a slightly-misnamed one.
- Config field names use `snake_case`. `prettyName` is what the user sees. `description` explains what the field controls and any formatting constraints the model must respect.

**Generation pipeline:**

- Context is layered: System → Setting → Story Prompt → World Snapshot → Volatile Data
- World Entries use two-phase generation: Phase 1 generates a list of names, Phase 2 generates detailed content per item
- S.E.G.A. (Story Engine Generate All) fills blank fields using round-robin queueing across categories
- Lorebook Sync is bidirectional between World Entry items and NovelAI Lorebook entries; manual NAI edits are protected

## Coding Guidelines

- Read `external/script-types.d.ts` to adhere strictly to NovelAI API signatures. Avoid `any` casts, especially with API interactions.
- Trust `.d.ts` files implicitly — do not wrap API calls in defensive existence checks unless handling a documented optional feature.
- Use `api.v1.hooks` (not deprecated `api.v1.events`). Use `api.v1.uuid()` for ID generation.
- No singletons/globals — prefer dependency injection wired in `src/index.ts`.
- Be bold, don't worry about data migration or supporting legacy patterns as we iterate.
- Adhere to the KISS Principle.
- Follow the Boyscout Rule. 

**UI Input Patterns:**

- Prefer `storageKey` on inputs for automatic persistence — avoid manual onChange handlers for simple state sync.
- Exception: Use `onChange` callbacks alongside `storageKey` when syncing to non-UIPart targets (e.g., `api.v1.an.set()`, `api.v1.memory.set()`). See ATTG/Style fields in `TextField.ts` for example.
- **Never dispatch actions in `onChange` callbacks.** The reducer overhead is too high for keystroke-frequency events. Direct API calls are acceptable in `onChange` when syncing to external APIs (e.g., `api.v1.lorebook.updateEntry()`). See `ListItem.ts` for example.
- **`storageKey` inputs are owned by storyStorage — never use `updateParts` to set their value.** Read with `api.v1.storyStorage.get(key)`, write with `api.v1.storyStorage.set(key, value)`, clear with `api.v1.storyStorage.remove(key)`. The input reads from its storageKey automatically. Using `updateParts({ value })` on a storageKey-bound input is incorrect — the stored value and displayed value will diverge.
- **`story:` prefix routing**: In a `storageKey` binding, `story:` is a routing directive the UI framework strips — `storageKey: "story:my-key"` persists under bare key `"my-key"` in storyStorage. `storyStorage.get("my-key")` reads the same slot; `storyStorage.get("story:my-key")` reads a literally different key and is always wrong. Never embed `story:` in storage key constants — add it only at the `storageKey` binding site. Pattern: constant = `"my-key"`, binding = `` `story:${MY_KEY}` ``, direct API = `storyStorage.get(MY_KEY)`. Use `storyStorage.remove(key)` to clear (not `set(key, null)`).

**UI Rendering Rules (nai-act constraints — these cause recurrent bugs when violated):**

- **Parts are static objects.** A `UIPart` returned from `build()` is a frozen spec. If a container's `content` array is ever updated via `updateParts`, the NovelAI UI engine re-applies all child specs — overwriting any text/style previously set by direct `updateParts` calls to those children. There is no `appendPart`; updating a container always re-initializes its children.

- **`useSelector` and `bindPart` do NOT fire on mount.** They fire only on subsequent state changes. Always populate initial display values using `ctx.getState()` inside `build()`. Never rely on a subscription to set the first render's content.

- **`initialDisplay` on `EditableText` is mandatory for correctness, not optional styling.** It must reflect current state at build time. Passing a prop value that may be stale (e.g., `message.content` when the message was just added with `content: ""`) will bake `"_No content._"` into the part spec permanently — and any future container rebuild will restore that blank state.

- **`bindPart` returns the initial mapped value — don't discard it silently.** Calling `ctx.bindPart(...)` as a statement means the initial text is never set in the part spec; it only updates on future state changes. Either spread the return value into the part definition, or set the initial text separately via `ctx.getState()`.

- **`bindList` is safe for mutable-content items.** The framework (nai-act) correctly remounts all child components from current state on every structural change, and uses array-equality comparison so it only fires when key values actually change — not on every action. Just use `ctx.bindList` normally; it handles the rest.

- **`useSelector` accepts an optional `equals` function** for custom comparison (e.g., array equality). Use it when the selector returns a new object/array reference on every call but you only want to fire on value changes.

## Key Constraints

- **No DOM:** Runs in QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **NovelAI API:** Generation via `api.v1.generate()`, storage via `api.v1.storyStorage`, UI via `api.v1.ui`, config via `api.v1.config`.
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- Existing docs: `external/` (framework READMEs).
- Code reviews: `CODEREVIEW.md`.
