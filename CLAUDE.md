# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NAI Story Engine is a NovelAI script (.naiscript) that guides structured worldbuilding through an 8-stage pipeline: brainstorming → story prompt → world snapshot → DULFS (Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics). Runs in NovelAI's web worker environment (QuickJS, no DOM).

## Commands

```
npm run build      # nibs build → dist/NAI-story-engine.naiscript
npm run test       # vitest run
npm run format     # prettier -w .
```

## Architecture

**Entry point:** `src/index.ts` — initializes GenX, registers store effects, loads persisted data, mounts UI extensions.

**Three custom frameworks in `lib/` (treat as read-only):**

- `nai-store.ts` — Redux-like store with `createSlice`, `dispatch`, `useSelector`, `subscribeEffect`
- `nai-act.ts` — Component framework with `describe()` (static structure) + `onMount()` (reactive subscriptions)
- `gen-x.ts` — Generation queue engine with budget management and pub/sub state updates

**State (`src/core/store/`):**

- `slices/story.ts` — Field contents and DULFS items
- `slices/brainstorm.ts` — Chat messages
- `slices/ui.ts` — Edit modes, temporary inputs
- `slices/runtime.ts` — Generation queue status, GenX state
- `effects.ts` — Side effects triggered by state changes
- Data persisted via `api.v1.storyStorage` under key `"kse-persist"`

**Config:** `src/config/field-definitions.ts` — `FIELD_CONFIGS` array defines all field metadata, layouts, and generation prompts. Uses `FieldID` enum throughout.

**UI (`src/ui/`):**

- Components follow nai-act pattern: static `describe()` returns UIPart tree, `onMount()` sets up reactive subscriptions via `ctx.useSelector()`
- All UI mutations use `api.v1.ui.updateParts()` — never re-render
- Element IDs centralized in `src/ui/framework/ids.ts` with prefixes: `se-` (story engine), `se-bs-` (brainstorm), `kse-` (storage keys)
- `src/core/utils/context-builder.ts` — Builds layered AI prompts from current state

**Prompts:** Configurable via `project.yaml` config fields (system prompt, brainstorm, world snapshot, lorebook generation, ATTG, style, etc.).

**Generation pipeline:**

- Context is layered: System → Setting → Story Prompt → World Snapshot → Volatile Data
- DULFS uses two-phase generation: Phase 1 generates a list of names, Phase 2 generates detailed content per item
- S.E.G.A. (Story Engine Generate All) fills blank fields using round-robin queueing across categories
- Lorebook Sync is bidirectional between DULFS items and NovelAI Lorebook entries; manual NAI edits are protected

## Coding Guidelines

- Read `external/script-types.d.ts` to adhere strictly to NovelAI API signatures. Avoid `any` casts, especially with API interactions.
- Trust `.d.ts` files implicitly — do not wrap API calls in defensive existence checks unless handling a documented optional feature.
- Use `api.v1.hooks` (not deprecated `api.v1.events`). Use `api.v1.uuid()` for ID generation.
- No singletons/globals — prefer dependency injection wired in `src/index.ts`.

**UI Input Patterns:**

- Prefer `storageKey` on inputs for automatic persistence — avoid manual onChange handlers for simple state sync.
- Exception: Use `onChange` callbacks alongside `storageKey` when syncing to non-UIPart targets (e.g., `api.v1.an.set()`, `api.v1.memory.set()`). See ATTG/Style fields in `TextField.ts` for example.
- **Never dispatch actions in `onChange` callbacks.** The reducer overhead is too high for keystroke-frequency events. Direct API calls are acceptable in `onChange` when syncing to external APIs (e.g., `api.v1.lorebook.updateEntry()`). See `ListItem.ts` for example.

## Key Constraints

- **No DOM:** Runs in QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **NovelAI API:** Generation via `api.v1.generate()`, storage via `api.v1.storyStorage`, UI via `api.v1.ui`, config via `api.v1.config`.
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- Existing docs: `external/` (framework READMEs).
