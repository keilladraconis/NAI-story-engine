# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NAI Story Engine is a NovelAI script (.naiscript) that guides structured worldbuilding through an 8-stage pipeline: brainstorming → story prompt → world snapshot → World Entries (Characters, Systems, Locations, Factions, Situational Dynamics, Topics). Runs in NovelAI's web worker environment (QuickJS, no DOM).

## Commands

```
npm run build      # nibs build → dist/NAI-story-engine.naiscript
npm run format     # prettier -w .
npm run test       # vitest run
```

**Prettier is pinned to an exact version — keep it that way.** Under a `^` range an older prettier already sitting in `node_modules` satisfies the range, so `npm install` leaves it in place and ignores the lockfile. That happened: a session formatting with 3.7.4 wrapped union types the pinned version keeps inline, which shipped as a spurious "formatting cleanup" (15fb872) and had to be reverted (ac49266). The exact pin does not help a `node_modules` installed for a _different branch_ — check out this branch over a tree installed from `main` and you still get 3.7.4, which is how a fourth session churned the same three files. So `npm run format` now runs a `preformat` guard (`npm ls prettier`) that refuses to format when the installed version does not match the pin, and tells you to run `npm ci`. If format ever does rewrite files you did not touch, the formatter is wrong, not the repo — do not commit the diff.

`npm run format` deliberately calls `prettier`, not `npx prettier`. npm already puts `node_modules/.bin` first on `PATH`, so both run the same local binary; the difference is that `npx` _fetches_ prettier from the registry when it is missing locally, which is one more way to format with a version the lockfile never pinned.

## Architecture

**Entry point:** `src/index.ts` — initializes GenX, registers store effects, loads persisted data, mounts UI extensions.

**Custom frameworks (treat as read-only):**

- `nai-store.ts` (in `lib/`) — Redux-like store with `createSlice`, `dispatch`, `useSelector`, `subscribeEffect`
- `gen-x.ts` (in `lib/`) — Generation queue engine with budget management and pub/sub state updates
- `nai-simple-ui` (in `vendor/`) — SUI component framework. `SuiComponent` subclasses own state, themes, and `compose()` logic. `StoreWatcher` bridges the nai-store to SUI.

**State (`src/core/store/`):**

- `slices/story.ts` — Field contents and World Entry items (DULFS)
- `slices/world.ts` — `WorldEntity` records, `WorldGroup` (Threads), forge loop flag
- `slices/brainstorm.ts` — Chat messages
- `slices/foundation.ts` — Shape, intent, ATTG, style fields
- `slices/ui.ts` — Edit modes, lorebook selection state
- `slices/runtime.ts` — Generation queue status, GenX state
- Data persisted via `api.v1.storyStorage` under key `"kse-persist"`

**Config:** `src/config/field-definitions.ts` — `FIELD_CONFIGS` array defines all field metadata, layouts, and generation prompts. Uses `FieldID` enum and `DulfsFieldID` union type throughout.

**UI (`src/ui/`):**

- Components are Preact function components under `src/ui/panels/` and `src/ui/components/`, composed into `App.tsx` and mounted by `mount.ts`. They read the store via `useSlice`/`useStream` (`src/ui/bridge.ts`), thin wrappers over `useSyncExternalStore` — snapshots are correct on first render, so there's no separate "seed the initial value" step to remember.
- The UI is Preact/JSX and re-renders from the store — **never** `updateParts`, with no exceptions. Nothing in `src/` calls it. The header used to be the one carve-out: a UIPart tree with its own diffing driver, because a click inside a `part.jsx()` did not clear the harness's user-interaction flag ("FlagB") and budget-stalled generation could only be resumed from a real `part.button()`. The runtime now sets that flag from JSX events (`click`, `dblclick`, `mousedown`/`mouseup`, `contextmenu`, `keydown`/`keyup`/`keypress`, `pointerdown`/`pointerup`, `touchstart`/`touchend`, `input`, `change`, `submit`), so `src/ui/header/Header.tsx` is an ordinary component rendered by `App` above the tab bar. Do not reintroduce a parts-and-patch surface to work around FlagB.
- `derive()` in `src/ui/header/header-model.ts` owns the generation state machine — it is the **only** place that branches on `genx.status`, and `tests/ui/countdown.test.ts` enforces that mechanically. `Header.tsx` renders the `WidgetMode` it returns and never reads the raw status; neither does any other component. Two surfaces reading the status directly is how they drift about whether a generation is waiting, queued, or done.
- Shared storyStorage keys and other core↔UI slot constants live in `src/core/keys.ts` (see its header comment — relocated out of the retired SUI `ui/framework/ids.ts`, which no longer exists). The handful of remaining literal UIPart ids (`kse-root`/`kse-jsx-root`/`kse-sidebar` in `mount.ts`, `OPENING_MODAL_IDS` in `header/opening-scene-modal.ts`) are local constants scoped to their own file, not a centralized registry — ordinary JSX elements need no ids of their own.
- `src/core/utils/context-builder.ts` — Builds layered AI prompts from current state

**Entity system (`src/ui/components/SeEntityCard.ts`, `SeEntityEditPane.ts`):**

- `WorldEntity` has `id`, `categoryId` (`DulfsFieldID`), `lifecycle` (`"draft" | "live"`), optional `lorebookEntryId`, `name`, and `summary`.
- **Entity summary** is a Story Engine–internal field. It is stored only in Redux, editable only in `SeEntityEditPane`, and **never synchronized with or derived from lorebook entry text**. The lorebook entry text is a separate field populated by generation.
- **Draft entities** have no lorebook entry. The "+ Add Entity" button creates a draft — **no lorebook entry is created until the user hits Save**, so cancelling out leaves no orphaned lorebook entries behind. The edit pane still exposes every field (name, summary, category, lorebook content, keys, Always On) so users can author the full entry by hand before promoting it; only the Generate icon buttons for content/keys are hidden, since those stream into a live lorebook entry that doesn't exist yet.
- **Live entities** have a lorebook entry (`lorebookEntryId`). Their edit pane additionally shows the Generate icon buttons next to Content and Keys. Lorebook content/keys are **only flushed to the lorebook API on Save** — not on every keystroke.
- **Draft → live promotion:** Saving a draft entity creates a lorebook entry in the entity's current category (via `ensureCategory(entity.categoryId)`) and persists the draft name, lorebook content, keys, and Always On state that were entered in the pane. The entry id is attached via `entityLorebookEntryBound`.
- **One entity per lorebook entry**: `entityBound` / `entitiesBoundBatch` drop any entity whose `lorebookEntryId` is already bound. Two entities over one entry would generate into it twice and list it twice in the World, and the Import wizard's Bind mints a fresh entity id per click — so the invariant is enforced in the reducer, not at the callsites.
- **Cast**: `castAllRequested` / `entityCastRequested` effects first look for an existing unmanaged lorebook entry with a matching `displayName` (case-insensitive) and bind to it. If none found, a new entry is created in the appropriate `SE: <Category>` lorebook category with empty text (summary is not seeded into lorebook).
- **Category**: `entity.categoryId` is a Story Engine concept — it drives sidebar organization, template selection, and the prefill `Type:` line. It is **independent of the lorebook entry's own category**: the lorebook category is where the entry lives in the user's lorebook, only assigned at creation time (`SeEntityEditPane` on save; cast/forge effects at bind time). Users commonly reorganize imported or long-running entries in their lorebook for their own preferences; Story Engine does **not** chase those moves, and `entityCategoryChanged` only updates Redux — it does not rewrite `entry.category`. `SeEntityEditPane` shows a category picker (SuiActionBar) for all entities.

**Prompts:** All generation prompts are hard-coded constants in `src/core/utils/prompts.ts`. They are **not** configurable via `project.yaml`. `project.yaml` contains only non-prompt settings (model, feature flags).

**Prompt policy — prompts live in `src/core/utils/prompts.ts`, not in code files and not in `project.yaml`.**

- Every generation prompt is an exported string constant in `prompts.ts`. Import and use directly — no `api.v1.config.get()` for prompt fields.
- `project.yaml` is for runtime settings only: `model`, `sega_skip_*`, `generation_journal`, `erato_compatibility`, `story_engine_debug`. Do not add prompt fields there.
- When adding a new prompt, add it to `prompts.ts` as a named export.

**Generation pipeline:**

- Context is layered: System → Setting → Story Prompt → World Snapshot → Volatile Data
- World Entries use two-phase generation: Phase 1 generates a list of names, Phase 2 generates detailed content per item
- S.E.G.A. (Story Engine Generate All) fills blank fields using round-robin queueing across categories
- Lorebook sync (`src/core/store/effects/lorebook-sync.ts`) manages SE-category creation and DULFS item→lorebook binding. It does **not** sync entity summaries in either direction — summaries are SE-internal only.
- **Information hierarchy for lorebook generation: DRAFT > LOREBOOK > STATE** for the fields that actually have all three layers (notably `displayName`): prefer in-pane draft values (storyStorage slots like `EDIT_PANE_TITLE`) first, then the lorebook API entry (so imported/user-edited lorebooks override whatever Redux thinks), and only then fall back to Redux world state. **Category is a deliberate exception** — it's an SE-side classification, so managed entities resolve through `entity.categoryId` and only unmanaged entries fall back to `entry.category`. `resolveDisplayName` / `resolveCategoryName` in `src/core/utils/lorebook-strategy.ts` are the canonical implementations.

## Coding Guidelines

- Read `external/script-types.d.ts` to adhere strictly to NovelAI API signatures. Avoid `any` casts, especially with API interactions.
- Trust `.d.ts` files implicitly — do not wrap API calls in defensive existence checks unless handling a documented optional feature.
- Use `api.v1.hooks` (not deprecated `api.v1.events`). Use `api.v1.uuid()` for ID generation.
- No singletons/globals — prefer dependency injection wired in `src/index.ts`.
- Be bold, don't worry about data migration or supporting legacy patterns as we iterate.
- Adhere to the KISS Principle.
- Follow the Boyscout Rule.
- Bump `project.yaml` `version` at most once per pull request. Subsequent commits on the same branch should not bump it again. **Story Engine is in alpha**, so the major version is locked at `0` — `1.0` is reserved for Beta and `2.0` for the production release. That shifts the standard semver rungs down one:
  - **Minor** — the "major"-scale changes (architecture, data model, persisted schema, generation pipeline restructure). These would normally be major bumps, but bump minor while the major is pinned at 0.
  - **Patch** — everything else: quality and accessibility improvements, prompt tuning, UX polish, new non-structural features, and bug fixes. Normally these would split across minor and patch; under the alpha lock they all go to patch.
- Keep `CHANGELOG.md` in step with the in-progress version on every commit that changes user-visible behavior. On the first commit that bumps the version, add a new section for it at the top of the file under the existing Keep-a-Changelog layout (`### Added / Changed / Fixed / Removed`). On subsequent commits to the same PR, trim or refine that section — merge duplicates, drop entries that were reverted, and rewrite bullets as the user-facing story sharpens. The goal is a final changelog entry that reads like a release note, not a commit log.

**DRY in the UI (don't branch render paths on entity state):** Avoid duplicating component construction or splitting `compose()` into "draft vs live" / "empty vs filled" / "isFoo vs isBar" render branches. Each branch is another stale-closure surface and another place to forget when a new field is added. Prefer one render path that always builds every part, and let the parts adapt themselves: `stateProjection`/`requestIdFromProjection` on a `SeGenerationIconButton` so the same button works for drafts and live entities; helpers like `_ensureLiveEntryId` so callers (Save, Generate Content, Generate Keys) don't each reimplement the promote logic. When a callsite genuinely needs different behavior, push the difference into the leaf — never fork the row/column scaffolding above it.

**UI Input Patterns:**

- **A tap can deliver `click` twice — never let a handler depend on being called once.** Observed on mobile: two `click` events inside one gesture, the second running after the first mutated state. Two rules follow. (1) Carry the data an intent needs **in the action payload**, never through a shared storyStorage slot read asynchronously by the effect — a second dispatch will overwrite the slot before the first read lands. (2) Wrap non-idempotent click handlers (sends, two-stage confirms, anything destructive) in `useTapGuard()` from `src/ui/tap-guard.ts`.
- **Bind text entry with `onInput`, never `onChange`.** The JSX renderer keeps native DOM semantics (Preact, not React): `input` fires per keystroke, `change` only when a modified field commits — i.e. on blur. An `onChange`-bound field therefore holds stale local state until focus leaves it, so anything reading that state before blur (a Send/Save button) sees the pre-edit value. `tests/ui/text-input-events.test.ts` guards the invariant.

- Prefer `storageKey` on inputs for automatic persistence — avoid manual onChange handlers for simple state sync.
- Exception: Use `onChange` callbacks alongside `storageKey` when syncing to non-UIPart targets (e.g., `api.v1.an.set()`, `api.v1.memory.set()`).
- **Never dispatch actions in `onChange` callbacks.** The reducer overhead is too high for keystroke-frequency events.
- **Do not call `api.v1.lorebook.updateEntry()` in `onChange`.** Lorebook writes happen at explicit commit points (e.g., clicking Save in an edit pane), not on every keystroke. `SeEntityEditPane` is the canonical example: content/keys draft in storyStorage, flushed to lorebook only on Save.
- **`storageKey` inputs are owned by storyStorage — never use `updateParts` to set their value.** Read with `api.v1.storyStorage.get(key)`, write with `api.v1.storyStorage.set(key, value)`, clear with `api.v1.storyStorage.remove(key)`. The input reads from its storageKey automatically. Using `updateParts({ value })` on a storageKey-bound input is incorrect — the stored value and displayed value will diverge.
- **`story:` prefix routing**: In a `storageKey` binding, `story:` is a routing directive the UI framework strips — `storageKey: "story:my-key"` persists under bare key `"my-key"` in storyStorage. `storyStorage.get("my-key")` reads the same slot; `storyStorage.get("story:my-key")` reads a literally different key and is always wrong. Never embed `story:` in storage key constants — add it only at the `storageKey` binding site. Pattern: constant = `"my-key"`, binding = `` `story:${MY_KEY}` ``, direct API = `storyStorage.get(MY_KEY)`. Use `storyStorage.remove(key)` to clear (not `set(key, null)`).

**UI Rendering Rules (JSX tree — SUI and the UIPart header are both gone):**

- **UIParts survive in exactly two places, and neither mutates.** `mount.ts` builds the panel scaffolding (`buildRoot` + the `part.jsx()` body), and `header/opening-scene-modal.ts` builds the Opening Scene modal, because `api.v1.ui.modal.open` takes a `UIPart[]` — an API constraint, not a FlagB workaround. Both construct their specs once and hand them over; parts are frozen objects, so anything that needs to change over time belongs in the Preact tree instead.

- **Never swap a component's _type_ at a fixed position.** `{armed ? <AlertTriangle/> : <Trash2/>}` leaves BOTH svgs in the DOM when the re-render comes from a detached callback — a timer tick or a store subscription rather than a JSX event handler. Mount every variant and toggle `display`, or give each variant its own keyed position in a list. `ConfirmButton.tsx` and `Header.tsx`'s `WidgetIcon` are the two worked examples; the header renders every state it can be in, since all of its renders are detached.

- **First render is already correct.** `useSlice`/`useStream` are built on `useSyncExternalStore`, so they return a real snapshot on mount — there is no "seed the initial value" step. Values that live outside the store need explicit help instead: `getAllowedOutput()` and the budget countdown come from a self-rescheduling `api.v1.timers` tick (`useTick` in `Header.tsx`), and `hasDocumentContent` is read once in `mount.ts` and passed to `App` as a prop so the bootstrap button's first paint carries the right label.

- **Non-idempotent handlers need `useTapGuard()`.** A mobile tap can deliver `click` twice within one gesture. UIPart buttons had `disabledWhileCallbackRunning`; JSX has no equivalent, so wrap the handler (`src/ui/tap-guard.ts`). The header's bootstrap button is the canonical case — it is the one non-idempotent header action.

## Key Constraints

- **No DOM:** Runs in QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **NovelAI API:** Generation via `api.v1.generate()`, storage via `api.v1.storyStorage`, UI via `api.v1.ui`, config via `api.v1.config`.
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- API types: `external/script-types.d.ts` — the authoritative NovelAI API surface.
