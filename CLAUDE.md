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

- All components are `SuiComponent` subclasses from `nai-simple-ui`. `compose()` returns a static UIPart tree; `StoreWatcher.watch()` drives reactive `updateParts()` calls.
- Non-storageKey UI mutations use `api.v1.ui.updateParts()` — never re-render. storageKey-bound inputs are the exception: update them via storyStorage, not updateParts (see UI Input Patterns below).
- Element IDs centralized in `src/ui/framework/ids.ts` with prefixes: `se-` (story engine), `se-bs-` (brainstorm), `kse-` (storage keys)
- `src/core/utils/context-builder.ts` — Builds layered AI prompts from current state

**Entity system (`src/ui/components/SeEntityCard.ts`, `SeEntityEditPane.ts`):**

- `WorldEntity` has `id`, `categoryId` (`DulfsFieldID`), `lifecycle` (`"draft" | "live"`), optional `lorebookEntryId`, `name`, and `summary`.
- **Entity summary** is a Story Engine–internal field. It is stored only in Redux, editable only in `SeEntityEditPane`, and **never synchronized with or derived from lorebook entry text**. The lorebook entry text is a separate field populated by generation.
- **Draft entities** have no lorebook entry. The "+ Add Entity" button creates a draft — **no lorebook entry is created until the user hits Save**, so cancelling out leaves no orphaned lorebook entries behind. The edit pane still exposes every field (name, summary, category, lorebook content, keys, Always On) so users can author the full entry by hand before promoting it; only the Generate icon buttons for content/keys are hidden, since those stream into a live lorebook entry that doesn't exist yet.
- **Live entities** have a lorebook entry (`lorebookEntryId`). Their edit pane additionally shows the Generate icon buttons next to Content and Keys. Lorebook content/keys are **only flushed to the lorebook API on Save** — not on every keystroke.
- **Draft → live promotion:** Saving a draft entity creates a lorebook entry in the entity's current category (via `ensureCategory(entity.categoryId)`) and persists the draft name, lorebook content, keys, and Always On state that were entered in the pane. The entry id is attached via `entityLorebookEntryBound`.
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

**UI Input Patterns:**

- Prefer `storageKey` on inputs for automatic persistence — avoid manual onChange handlers for simple state sync.
- Exception: Use `onChange` callbacks alongside `storageKey` when syncing to non-UIPart targets (e.g., `api.v1.an.set()`, `api.v1.memory.set()`).
- **Never dispatch actions in `onChange` callbacks.** The reducer overhead is too high for keystroke-frequency events.
- **Do not call `api.v1.lorebook.updateEntry()` in `onChange`.** Lorebook writes happen at explicit commit points (e.g., clicking Save in an edit pane), not on every keystroke. `SeEntityEditPane` is the canonical example: content/keys draft in storyStorage, flushed to lorebook only on Save.
- **`storageKey` inputs are owned by storyStorage — never use `updateParts` to set their value.** Read with `api.v1.storyStorage.get(key)`, write with `api.v1.storyStorage.set(key, value)`, clear with `api.v1.storyStorage.remove(key)`. The input reads from its storageKey automatically. Using `updateParts({ value })` on a storageKey-bound input is incorrect — the stored value and displayed value will diverge.
- **`story:` prefix routing**: In a `storageKey` binding, `story:` is a routing directive the UI framework strips — `storageKey: "story:my-key"` persists under bare key `"my-key"` in storyStorage. `storyStorage.get("my-key")` reads the same slot; `storyStorage.get("story:my-key")` reads a literally different key and is always wrong. Never embed `story:` in storage key constants — add it only at the `storageKey` binding site. Pattern: constant = `"my-key"`, binding = `` `story:${MY_KEY}` ``, direct API = `storyStorage.get(MY_KEY)`. Use `storyStorage.remove(key)` to clear (not `set(key, null)`).

**UI Rendering Rules (SUI + NAI constraints — these cause recurrent bugs when violated):**

- **Parts are static objects.** A `UIPart` returned from `compose()` is a frozen spec. If a container's `content` array is ever updated via `updateParts`, the NovelAI UI engine re-applies all child specs — overwriting any text/style previously set by direct `updateParts` calls to those children. There is no `appendPart`; updating a container always re-initializes its children.

- **`StoreWatcher.watch()` does NOT fire on mount.** It fires only on subsequent state changes. Always populate initial display values synchronously inside `compose()` via `store.getState()`. Never rely on a watcher callback to set the first render's content.

- **`compose()` must call `this._watcher.dispose()` at its start** to tear down subscriptions from any prior build cycle, then re-register all watchers fresh.

- **Component root IDs must be unique per context, not just per entity.** If the same logical entity appears in two contexts (e.g., draft in ForgeSection, live in BatchSection), each context must produce a distinct root ID — e.g., `se-entity-draft-${id}` vs `se-entity-live-${id}`. The `IDS.entity(id, lifecycle)` factory enforces this: `lifecycle` is required with no default so TypeScript will catch any omission.

- **`SuiTabBar` reads `tab.options.callback` at compose time.** Tab button callbacks that call `tabBar.switchTo(i)` must use closures over `this._tabBar` (assigned before any click fires), not post-construction assignment to `options.callback` (which is `Readonly`).

- **`updateParts` replaces style wholesale.** When a SUI component like `SuiActionBar` bakes a `base` style onto its children at build time, a subsequent `updateParts` call must include ALL desired CSS properties — not just the changed ones. Use camelCase property names (`fontWeight`, `fontSize`) to match what `SuiActionBar` emits; mixing kebab-case into the same object causes divergence before vs. after interaction.

## Key Constraints

- **No DOM:** Runs in QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **NovelAI API:** Generation via `api.v1.generate()`, storage via `api.v1.storyStorage`, UI via `api.v1.ui`, config via `api.v1.config`.
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- API types: `external/script-types.d.ts` — the authoritative NovelAI API surface.
