# Changelog

All notable changes to this project will be documented in this file.

## [0.11.2] - 2026-04-24

### Fixed

- **Lorebook entries now open with the bare entity name on the first line**, matching the per-category templates (`[Entry Name]` / `Type: …` / `Setting: …`). The prefill previously prepended a redundant `Name:` label that didn't match the template, causing the model to drift into a freeform header instead of following the template.

## [0.11.1] - 2026-04-24

### Fixed

- **Lorebook generation now respects the entity's selected type and typed name.** Previously a new world entity would generate as a Character regardless of the category picked in the edit pane, and the saved entry would be headed `Name: Unnamed Entry` if the user hadn't hit Save first. Name/category resolution now follows a **DRAFT > LOREBOOK > STATE** hierarchy, and the prefill written to the saved entry matches what was sent to the model.

### Changed

- **"+ Add Entity" no longer pre-creates a lorebook entry.** The lorebook entry is only created when you hit Save (or click Generate Content / Generate Keys) on the edit pane, so cancelling out of a new entity doesn't leave an orphan entry in your lorebook. You can author the full lorebook body — content, keys, and Always On — while the entity is a draft; everything persists in one go.
- **Story Engine category and lorebook category are now separate.** Reassigning an entity's type in the edit pane updates how Story Engine treats it (template, prefill, sidebar grouping) without moving the entry inside your lorebook. Imported entries and long-running stories keep whatever organization you've chosen in the lorebook.
- **Extra bottom padding on the entity edit pane** so the Keys row and Always On toggle stay clear of mobile bezels.

## [0.11.0] - 2026-04-20

### Added

- **UI rewrite on `nai-simple-ui` (SUI)** — The entire UI layer has been rebuilt on the `nai-simple-ui` component framework, vendored from OnepunchVAM's **Simple Context** (with thanks). `SuiComponent` subclasses now own state, theming, and `compose()` logic; `StoreWatcher` bridges the Redux-like store to SUI. This replaces the per-section UIPart builders used through 0.10.x and is the foundation for every section, pane, card, and modal in the sidebar.

- **Bootstrap** — New cold-open writer wired to a button in the panel header. Two-phase generation writes directly into the document: Phase 1 produces an opening passage grounded in Shape, Intent, and Brainstorm; Phase 2 continues paragraph by paragraph, finalizing at each `\n\n` boundary so undo history stays clean. Prompts enforce in-the-moment sensory grounding and block common tell-don't-show antipatterns — named emotions, participle/appositive stacks, internal-sensation metaphors, thematic narration, and scene-closing resolutions.

- **Phased Forge** — The Forge now runs a 12-step, guidance-driven loop in three phases. **Sketch** (steps 1–4) populates breadth: characters, locations, situations, systems. **Expand** (5–8) deepens and prunes — REVISE thin elements, CREATE noticeable gaps, DELETE overlap. **Weave** (9–12) THREADs structural bonds and CREATEs SITUATION entries at collision points. Per-phase temperature and token budgets; the model can emit `[DONE]` in weave to end early. Replaces the 0.10.x Crucible command loop.

- **Prerelease CI workflow** — `.github/workflows/prerelease.yml` publishes development builds from `v*-*` branches.

### Changed

- **Forge is intent-driven, not command-menu driven.** The command log is still used internally to prevent rework, but Forge now reads Foundation + Brainstorm + optional guidance and runs the phased loop to completion — no per-pass command controls to juggle.

- **ATTG and Brainstorm refinements** — ATTG prompt tightened; Brainstorm summary and critic flows polished based on 0.10.x feedback.

- **Load-time sync reduced** — Script startup does less synchronous work before the UI mounts.

### Removed

- **"Direction" field removed.** Direction — and the other summary/synopsis fields that lived in the old Crucible flow — has been superseded by **Brainstorm's summary mode**. Summarizing a Brainstorm chat now produces the dense material the Forge reads, so there's a single source of story framing rather than two fields maintained in parallel.

- **"Canon" field removed.** Canon has no direct replacement — it turned out to be extraneous in the new design. The role it played (fixed facts the story must honor) is covered today by **Story Contract** (REQUIRED / PROHIBITED / EMPHASIS) in Foundation and by entity summaries in the World section; those arrive at the same outcome with less overhead.

## [0.10.4] - 2026-04-01

### Added

- **Xialong model support** — New "Model" config option lets you choose between GLM 4.6 and Xialong (`xialong-v1`). All generation calls now read from this config instead of hardcoding `glm-4-6`.

### Changed

- **Style syncs to Memory instead of Author's Note** — The Style field's "Copy to Author's Note" checkbox is now "Copy to Memory". When either ATTG or Style sync is enabled, Memory receives the combined format: `[ ATTG ][ S: 4 ]\n[ STYLE ]`.

## [0.10.3] - 2026-03-18

### Fixed

- **Stale content in dynamic lists** — Editing a Tension Card's text and then adding or removing a tension would revert your edits. The same issue affected World Entry lists. Root cause: the framework's `bindList` reused build-time part specs on container rebuilds, overwriting any post-mount text changes. Fixed in nai-act 0.3.0 (full remount on structural change); `TensionsSection` and `ListField` now use `ctx.bindList` directly.

- **Storage key mismatches** — A prior refactor left several storage keys inconsistent, causing data (ATTG sync state, field content, list item content) to silently fail to load. All storage keys are now defined in a centralized `STORAGE_KEYS` registry in `ids.ts` and used consistently throughout the codebase.

- **Generation journal premature writes** — `recordEntry` now guards against writes before `loadJournal()` completes on script startup.

- **Lorebook category migration crash** — `migrateLorebookCategories` no longer throws when a lorebook category has a null/empty name.

### Changed

- **Brainstorm message bubbles** — The custom view/edit toggle in `Message` has been replaced with `EditableText` styled as a bubble. Simpler and consistent with other editable fields.

- **Framework update: nai-act 0.3.0 + nai-store 0.3.0** — `bindList` now correctly remounts all children from current state on structural changes and fires only when key values actually change (not on every action). `useSelector`/`subscribeSelector` accept an optional `equals` function for custom change detection.

## [0.10.2] - 2026-03-11

### Fixed

- **Bootstrap streaming no longer pollutes undo history** — Previously, Bootstrap streamed each token as a live `updateParagraph` call, creating hundreds of undo/redo entries in the NAI editor per generation. The live-update coalescing machinery (`scheduleLiveUpdate`, `updatePending`, in-place `activeSectionId` tracking) has been removed. Paragraphs are now finalized to the document only at `\n\n` boundaries during streaming; the final partial paragraph is written once on completion. This produces one undo entry per paragraph instead of one per token.

### Changed

- **Lorebook Refine supports continuation** — Refine generation now uses `continuation: { maxCalls: 3 }`, allowing the model to continue across up to three calls if the response is cut off mid-entry.

## [0.10.1] - 2026-03-11

### Fixed

#### Crucible — Build Loop Stub Reliability

- **LINK no longer auto-creates wrong-type stubs** — Previously, `[LINK "A" → "B"]` commands would silently create a CHARACTER stub for any unknown endpoint, even if the referenced element was a Location, System, or Topic. These stubs were then left empty with the wrong type. Now, unknown endpoints are logged as warnings and surface to GLM explicitly instead.
- **`[MISSING ELEMENTS]` section in world state** — `formatWorldState` now appends a `[MISSING ELEMENTS]` block listing any name referenced in a relationship that has no corresponding world element. GLM sees the missing names and is instructed to CREATE them with the correct type.
- **`[unfilled]` annotation for empty elements** — World elements with no content now render as `- Name [unfilled]` in the formatted world state, making gaps visible at a glance rather than appearing as a bare name with no signal.
- **Mandatory revision block in build pass context** — `createBuildPassFactory` now computes unfilled elements and missing link endpoints at JIT time and injects a `REQUIRED THIS PASS:` block directly into the user message. This is more reliable than a world-state annotation alone — the instruction appears prominently and names every element that must be addressed in the current pass.

## [0.10.0] - 2026-03-10

### Added

#### Crucible — Command-Driven Build Loop

The v9 prerequisites → elements pipeline is replaced by a structured command loop where GLM emits discrete world-building commands that are parsed and executed against live world state.

- **Command vocabulary** — GLM emits `[CREATE <TYPE> "<Name>"]`, `[REVISE "<Name>"]`, `[LINK "<From>" → "<To>"]`, `[DELETE "<Name>"]`, `[CRITIQUE]`, and `[DONE]` commands in each build pass. These are parsed by `crucible-command-parser.ts` and executed atomically against the store.
- **Multi-pass with guidance** — Each build pass is user-triggered. A guidance input accepts freeform instructions (e.g. "add more factions") before kicking off the next pass. Pass 1 establishes the world; subsequent passes refine and extend it.
- **`[CRITIQUE]` self-assessment loop** — GLM critiques its own output at the end of each pass, identifying gaps and contradictions. The critique is displayed to the user and informs the next pass via a structured `[DONE]` signal.
- **`[LINK]` relationship graph** — Explicit relationships between world elements are now tracked as `CrucibleLink` objects and displayed in the build view, making cross-element dependencies visible.
- **`BuildPassView`** — New build UI showing the live command ticker during generation, the command log per pass, all world elements (grouped by DULFS type), and the relationship link graph. Replaces `ReviewView` and `ProgressDisplay`.
- **`crucible-world-formatter.ts`** — Shared formatter serializes the current world state (elements + links) into a structured text block injected into pass 2+ context.

#### Tensions (formerly Goals)

The "Goals" step is redesigned as **Tensions** — structural pressures and irresolvable conflicts that drive the world, rather than dramatic endpoints to build toward.

- **`TensionsSection`** — Replaces `GoalsSection`. Generates tensions from shape + direction; each tension has an accept/reject toggle (accepted tensions are used in the build pass). Build World button launches the first pass.
- **`TensionCard`** — Replaces `GoalCard`. Displays tension text with accept/reject and delete controls. No `why` field.
- **`crucibleTensionsRequested`** — New signal action replacing `crucibleGoalsRequested`.
- **`crucibleBuildPassRequested`** — New signal action replacing `crucibleBuildRequested`; carries pass number and guidance.

#### Topics — New DULFS Category

- **Topics** (`FieldID.Topics`) — Sixth DULFS category: "What characters discuss — rumors, debates, shared history." Each topic is a name + one-line description of what makes it contentious and who holds which positions. Bidirectionally synced with lorebook.
- Topic entries flow through SEGA lorebook generation alongside existing DULFS categories.

#### Generation Journal

- **Journal panel** — New sidebar panel (book icon) that records every generation request: label, timestamp, full prompt, response, uncached token count, and success status. Copy as markdown or as a compact digest. Useful for diagnosing prompt quality and cache efficiency.
- **`generation-journal.ts`** — Backing module persisted to `kse-gen-journal` in storyStorage.

#### Setting Field Moved to Crucible

- The "Setting" text input (formerly in the Story Engine sidebar header) is now a field within the Crucible panel's context section, where it belongs conceptually alongside shape and direction.

### Changed

#### Crucible

- **Tensions replace Goals** — `CrucibleGoal` renamed to `CrucibleTension`. `goals` state array replaced by `tensions`. Phase `"goals"` renamed to `"tensions"`. UI, actions, and handlers updated throughout.
- **Prerequisites removed** — The separate prerequisite derivation step is gone. The build pass command loop generates world elements directly from tensions.
- **`passes` log in state** — `CrucibleState` tracks completed build passes as `CrucibleBuildPass[]`, each with its command log and guidance text.
- **Canon context strengthened** — `createCanonFactory` now injects Crucible Direction as a `[DIRECTION — AUTHORITATIVE]` system message (supersedes brainstorm exchanges on all character and world facts) and Shape as `[NARRATIVE SHAPE — REQUIRED]` (model must use the exact shape name). `contextPinning.tail: 3` pins these to the context window tail when present.
- **Shape prompt quality** — Added a CRITICAL instruction: description must express structural logic, not a plot synopsis or character list. Pre-filled name generation no longer anchors to specific characters.

#### SEGA — Lorebook Reliability

- **Duplicate relmap runs fixed** — `relmapsCompleted` flag (symmetric with `keysCompleted`) dispatched at the top of the relmap completion handler, before any `await`. Prevents re-queue during the 100ms scheduling window.
- **Duplicate keys runs fixed** — `keysCompleted` flag moved to the top of the keys completion handler (was dispatched after async lorebook API calls), closing the race window that caused multiple key sets per entry.
- **Relmap self-reference rule** — Relational map prompt now explicitly prohibits listing the entry's own subject in the related characters field.

#### Lorebook Keys

- **`validateKey` overhaul** — Parses `/pattern/flags` format; supports `i`, `s`, `m`, `u` flags per NAI spec. Rejects malformed regex (no closing `/`). Handles `&` compound keys by splitting on `&` and validating each part recursively. Preserves original casing on regex keys.
- **Overbroad check extended** — 3-character test strings added: `"any"`, `"the"`, `"len"`, `"ion"`, `"ing"`, `"ers"`, `"for"`, `"are"`.
- **Multi-line `KEYS:` format supported** — `parseLorebookKeys` now detects the multi-line format (header line + one key per subsequent bullet line) and collects correctly. Previously returned empty, leaving stub keys and triggering re-queue.
- **Dash character class widened** — Strip pattern now matches en-dash, em-dash, and bullet characters (`\u2013`, `\u2014`, `\u2022`, `*`) in addition to ASCII hyphen.
- **Keys prompt rewritten** — Added KEY TYPES reference section: plain text (preferred), `/regex/i`, compound `&`. Explicitly bans fragmentary name regex. Updated all examples: plain keys predominate, regex only for legitimate plural/variant, compound keys demonstrated with `&`.

### Breaking Changes

- **`CrucibleGoal`** renamed to **`CrucibleTension`**. Persisted goal data is not migrated.
- **`goals`** replaced by **`tensions`** in `CrucibleState`. Old goal arrays are dropped on upgrade.
- **`prerequisites`** removed from `CrucibleState`. Prerequisite data is not preserved.
- **`crucibleGoalsRequested`** renamed to **`crucibleTensionsRequested`**.
- **`crucibleBuildRequested`** replaced by **`crucibleBuildPassRequested`**.
- **`goalAcceptanceToggled`** replaced by **`tensionAcceptanceToggled`**.
- **`goalAdded` / `goalRemoved` / `goalsCleared` / `goalTextUpdated`** replaced by tension equivalents.
- **`crucibleChain` / `cruciblePrereqs` / `crucibleElements` / `crucibleExpansion`** request types removed. Replaced by **`crucibleTension`** and **`crucibleBuildPass`**.
- **`ReviewView` / `ProgressDisplay`** removed. Replaced by `BuildPassView`.
- **`crucible-chain-strategy.ts`** removed. Replaced by `crucible-build-strategy.ts`.
- **Topics (`FieldID.Topics`)** added as sixth DULFS category. Existing lorebook entries are unaffected, but the Topics panel is new and empty on upgrade.

### Developer

- **`crucible-command-parser.ts`** — Full command parser + executor. `parseCommands(text)` returns typed command objects; `executeCommands(commands, getState, dispatch)` applies them to store and returns a command log.
- **`crucible-build-strategy.ts`** — `buildBuildPassStrategy` / `createBuildPassFactory`; builds context from direction + tensions + current world state + optional user guidance.
- **`crucible-world-formatter.ts`** — `formatWorldState` / `formatWorldSummary` for injecting current elements + links into pass context.
- **`generation-journal.ts`** — `recordEntry`, `formatJournal`, `formatDigest`, `clearJournal`; persisted to `kse-gen-journal`.
- **`crucible-build.test.ts`** — 12 tests covering command parsing, execution, CREATE/REVISE/LINK/DELETE/CRITIQUE/DONE semantics.
- **`crucible-command-parser.test.ts`** — 18 tests covering parse edge cases, compound commands, unknown types, malformed input.
- **`crucible-chain.test.ts` / `crucible-chain-strategy.ts`** — Removed (no callers).

### Developer Notes

- 13 commits on v10 branch.
- 49 files changed, 3,257 insertions, 2,195 deletions.
- New UI: `BuildPassView.ts` (507 lines), `TensionsSection.ts`, `TensionCard.ts`, `JournalPanel.ts`.
- New utilities: `crucible-command-parser.ts`, `crucible-build-strategy.ts`, `crucible-world-formatter.ts`, `generation-journal.ts`.
- Removed: `GoalsSection.ts`, `ReviewView.ts`, `ProgressDisplay.ts`, `GoalCard.ts`, `crucible-chain-strategy.ts`, `handlers/crucible-chain.ts`, `Sidebar/SettingField.ts`.

## [0.9.3] - 2026-03-03

### Fixed

- **Lorebook keys fallback** — When key generation produces no `KEYS:` line, keys now fall back to tokens derived from the entry's display name (`keysFromDisplayName`) instead of silently doing nothing. Single-character tokens are dropped.
- **Direction flush before goal generation** — Goal generation now calls `flushActiveEditor()` before proceeding, ensuring any unsaved direction edit reaches state before context is built. Previously it read `cr-direction` from storyStorage directly and dispatched `directionSet`, which could produce stale context if the draft was out of sync.
- **ReviewView Expand button layout** — "Expand Element" button moved below the editable element text (was in the badge header row), where it doesn't visually conflict with the field label. Label updated from "Expand" to "Expand Element".

### Changed

- **Direction generation uses prefill** — Strategy now uses `assistantPrefill: "The story "` with `prefillBehavior: "keep"` and `continuation: { maxCalls: 2 }`, improving output structure and handling truncation gracefully.
- **`effects.ts` → `register-effects.ts`** — The module that wires all effect registrations is now `src/core/store/register-effects.ts`, which better reflects its role.

### Performance

- **`GenerationButton` fan-out eliminated** — Every mounted `GenerationButton` previously called `api.v1.ui.updateParts` on every store dispatch, regardless of whether the button's visible state actually changed. With 50+ icon buttons mounted in a populated DULFS list, a single click could trigger hundreds of synchronous worker-boundary API calls. A mode guard (`if (mode === lastMode) return`) skips `updateParts` unless the button truly needs to change appearance.

### Developer

- **`escapeForMarkdown` utility** — New shared helper in `src/ui/utils.ts` (accepts optional `fallback`) replaces inline `escapeViewText` / `formatForDisplay` functions that were duplicated across `IntentSection`, `GoalCard`, and `ReviewView`.
- **`updateVisibility` utility** — New batch helper in `src/ui/utils.ts` accepts `[id, visible][]` tuples and issues a single `updateParts` call with `display:flex` / `display:none`.
- **`GenerationIconButton` component** — Typed wrapper in `GenerationButton.ts` that pre-configures `variant: "icon"`, replacing manual `variant: "icon"` prop at call sites (e.g. `ListItem`).
- **storyStorage key conventions documented** — Comment block added to `ids.ts` explaining `story:`, `cr-`, and unprefixed key semantics.
- **`generateAction` type tightened** — `GenerationButtonProps.generateAction` is now `{ type: string }` instead of `any`.

## [0.9.2] - 2026-03-02

### Fixed

- **Multi-goal generation** — Generating several goals in parallel no longer breaks. `GoalsSection`'s card cache (`ensureGoalCard`) now returns the existing mounted card instead of remounting on every render, preventing subscription leaks and stale UI state during concurrent generation.
- **Stop cleans up in-progress goals** — When Crucible stop is requested, goals that were actively generating (queued or active `crucibleGoal` requests) are detected and removed from state. Previously, partial or empty goal text remained in the list after a stop.
- **Add Goal no longer triggers generation** — `crucibleAddGoalRequested` now only creates an empty goal slot for manual writing. It no longer dispatches a generation request; Add ≠ Generate.

### Developer

- **`parseLorebookKeys` extracted** — Moved out of `lorebookKeysHandler` into a standalone exported function in `handlers/lorebook.ts` for independent testability.
- **Tests added** — New suites: `tests/core/store/slices/crucible.test.ts`, `tests/core/store/effects/handlers/crucible-chain.test.ts`, `tests/core/store/effects/handlers/lorebook.test.ts`, `tests/core/utils/tag-parser.test.ts`.

## [0.9.1] - 2026-03-02

### Fixed

- **SEGA cancellation stuck state** — `cancelAllSegaTasks` now force-clears all tracked requests from the store immediately: dispatches `requestCancelled`, then `stateUpdated({ status: "idle", queueLength: 0 })`, then `requestCompleted` for every SEGA-tracked request. Previously, GenX's internal wait (e.g. `waiting_for_user` or `waiting_for_budget`) could block indefinitely, leaving generation buttons stuck in an active state after the user pressed stop.

### Removed

- **Dead code purge** — `src/core/subscribable.ts` (old pub/sub remnant), `src/core/utils/seeded-random.ts` (`seededShuffle` and `stableOrderWithNewAtEnd` had no callers), `src/ui/components/Crucible/MergedView.ts` (orphaned component). The stale shape-handler side effect that wrote the generated name directly to storyStorage and called `updateParts` on the shape input is gone — shape state is now driven entirely by `updateShape` + `useSelector`.

## [0.9.0] - 2026-03-02

### Added

#### Crucible — Generative Shape System

Shape is no longer detected from a fixed list of six archetypes. The AI now _invents_ a shape that fits your story material — any structural lens, including casual or slice-of-life forms that the old classifier ignored.

- **`ShapeSection`** — New collapsible panel section (above Direction) with a name input, an editable instruction textarea, and a GenerationButton. The shape name and instruction together form the structural context injected into Direction and Goal generation. Auto-expands when no shape is set.
- **Generative shape prompt** (`crucible_shape_prompt`) — New config field. The prompt includes nine example shapes spanning the full tonal range (dramatic: Climactic Choice, Spiral Descent, Hero's Journey; casual: Intimate Moment, Slice of Life; plus more). GLM reads the brainstorm and invents the shape that fits, or names one directly if the brainstorm specifies it. Shape name can be pre-filled to constrain generation to just the instruction.
- **Crucible system prompt** (`crucible_system_prompt`) — New config field. A base system identity injected as the first message in every Crucible request (shape, direction, goals, prerequisites, elements, expansion). Previously this was hardcoded.
- **`crucibleShapeRequested`** — New signal action; triggers shape generation. Independent of goals — `goalsCleared` no longer resets the shape.

#### GenerationButton — Immediate Cancel from Wait State

- Clicking cancel during the budget-wait countdown now immediately clears the timer display and stops the countdown, without waiting for store propagation. Previously the countdown would continue briefly after clicking cancel.

### Changed

#### Crucible

- **Goal acceptance replaces starring** — `CrucibleGoal.starred` renamed to `accepted`. The star/unstar button is replaced by a check/X toggle: green check = included in world build, red X = excluded. The delete button is hidden while a goal is accepted, preventing accidental removal.
- **Shape badge removed from Goals section** — Shape is now managed in ShapeSection; the purple badge in the Goals header is gone.
- **Goals no longer clear shape** — `goalsCleared` resets goals only; shape is independent.
- **Goals generated without placeholder text** — Goals are added to the list before generation completes without the `"_Generating..._"` stub, so the list layout doesn't shift.
- **Direction prompt expanded** — Now instructs GLM to _extrapolate_ when the brainstorm is sparse: invent implied occupations, social worlds, secondary figures, and latent tensions. Removed the "name a story architecture" instruction (that role now belongs to ShapeSection).
- **Goals prompt simplified** — Shape context is now provided by ShapeSection; the goals prompt focuses on endpoint quality and format. `crucible_structural_goal_prompt` (the reframe step) removed — goals are shape-native directly.
- **Prerequisites prompt** — Now explicitly includes social textures, background pressures, and existing relationships alongside structurally necessary elements.
- **Elements prompt** — Now requests secondary characters, rivals, complicating figures, and background forces, not just direct prerequisite satisfiers.

#### Prompt Rewrites

- **Critic prompt** — Richer and more genre-fluid. New character texture section calls out specific gaps to probe: wants vs. needs, surface/shadow/history, occupation, living situation, haunts. Guidance updated: respect the genre, lead with the gap, stay conversational.
- **Summarize prompt** — Completely rewritten. Now produces declarative present-tense working notes ("The setting is..."), not a summary of the conversation process. Forbidden language includes any reference to deliberation, rejected ideas, or how the brainstorm evolved.

#### Developer

- **Effects module split** — `effects.ts` (1,288 lines) broken into focused modules:
  - `effects/generation-engine.ts` — Core GenX dispatch loop, request lifecycle, budget management
  - `effects/brainstorm-effects.ts` — Brainstorm submit, edit, retry, summarize, title generation
  - `effects/crucible-effects.ts` — Full Crucible pipeline (shape → direction → goals → build → merge → expand)
  - `effects/lorebook-generation.ts` — Lorebook content, map, keys, refine scheduling
  - `effects/lorebook-sync.ts` — Bidirectional lorebook ↔ DULFS sync
  - `effects/autosave.ts` — Persistence effects

### Breaking Changes

- **`CrucibleState.detectedShape: string | null`** replaced by **`shape: { name: string; instruction: string } | null`**. Old persisted shape strings cannot be migrated; shape resets to null on upgrade.
- **`CrucibleGoal.starred`** renamed to **`accepted`**. Persisted goal data will lose star state on upgrade.
- **`crucibleShapeDetection` request type** renamed to **`crucibleShape`**.
- **`shapeDetected` action** replaced by **`updateShape`**.
- **`goalStarred` action** replaced by **`goalAcceptanceToggled`**.
- **`crucible_structural_goal_prompt` config field** removed — the reframe step no longer exists.
- **`migrateCrucibleState`** removed from `crucible.ts` — no longer needed.

### Developer Notes

- 11 commits on v9 branch.
- 26 files changed, 1,938 insertions, 1,672 deletions (net +266 lines — the god-module split accounts for most movement).
- New UI component: `src/ui/components/Crucible/ShapeSection.ts`.
- New effects modules: `effects/generation-engine.ts`, `effects/brainstorm-effects.ts`, `effects/crucible-effects.ts`, `effects/lorebook-generation.ts`, `effects/lorebook-sync.ts`, `effects/autosave.ts`.
- New config fields: `crucible_system_prompt`, `crucible_shape_prompt`. Removed: `crucible_structural_goal_prompt`.

## [0.8.1] - 2026-02-27

### Fixed

- **Stub keys** — SEGA's lorebook content stage now inserts a single stub key equal to the entry's lowercased display name, replacing the old `["kse-stub", ...nameWords]` pattern. This removes the internal `kse-stub` sentinel from the visible lorebook UI and eliminates spurious one- or two-letter keys that could appear when a title contained short words. `findEntryNeedingKeys` now detects stubs by checking for exactly one key matching the entry's own name.

## [0.8.0] - 2026-02-26

### Added

#### Crucible — Shape-Native Goal Pipeline (Complete Redesign)

The v7 constraint-solving architecture (solver → builder → director, 15+ calls per chain) has been replaced with a leaner backward-reasoning pipeline that derives world elements directly from dramatic endpoints.

- **Shape detection** — Before goals are generated, the AI classifies the story's narrative structure from six archetypes: Climactic Choice, Spiral Descent, Threshold Crossing, Equilibrium Restored, Accumulated Weight, Revelation. Displayed as a badge in the Goals section; conditions how goals are framed.
- **Shape-native goals with `why`** — Goals are now structural endpoints, not scene scaffolds. Each `CrucibleGoal` includes a `why` field explaining its narrative function. The separate "reframe" step is gone; `StructuralGoal` type removed entirely.
- **Star goals** — Goals can be starred to focus world-building on the most compelling endpoints.
- **Prerequisites** — World-building now derives prerequisites (relationships, secrets, power structures, histories, objects, beliefs, places) that must exist for a goal to be narratively possible. `Prerequisite` interface: `{ id, element, loadBearing, category, satisfiedBy[] }`.
- **World elements** — Elements satisfy prerequisites directly, mapping to DULFS fields. Each `CrucibleWorldElement` can carry `want`, `need`, and `relationship` attributes for richer characters and factions.
- **Expand** — Any merged world element can seed a mini-chain (expansion prereqs → new elements), accessible from ReviewView after merging.
- **`ReviewView`** — New review phase UI showing prerequisites grouped by category and world elements grouped by DULFS field, each individually editable before merge. Replaces the old `WorldBuildingView` + `SceneCard` layout.
- **`ProgressDisplay`** — Step checklist visible during the building phase.
- **`GoalCard` with why** — Goal cards show both the goal text and the AI's reasoning for why it's a compelling endpoint.

#### Brainstorm — Sessions & Summarization

- **Multiple sessions** — Brainstorm now supports named chat sessions. Create, rename, switch between, and delete sessions via the Sessions modal (folder icon in BrainstormHeader). The active session is used as context for all Story Engine and Crucible generation.
- **Summarize** — "Sum" button in the header collapses the current chat into a dense summary using the configurable `brainstorm_summarize_prompt`. Useful for long brainstorms before moving to Crucible.
- **Mode toggle** — "Co" (cowriter) and "Crit" (critic) mode buttons switch the AI's brainstorming persona.

#### SEGA — Lorebook Relational Maps

- **Relational map stage** — SEGA now generates a relational map per lorebook entry before key generation. The map captures cross-entry dependencies (primary locations, affiliated factions, known associates, relevant objects) to inform key generation with full world context.
- **Reconciliation pass** — Entries with no primary characters or high collision risk receive a second map pass, reducing activation conflicts.
- **Stub keys** — After content generation, SEGA immediately inserts stub activation keys (`["kse-stub", ...nameWords]`) so entries activate in story text without waiting for Stage 7. Keys generation then replaces stubs with map-informed proper keys.
- **Skip flags** — `sega_skip_lorebook_relational_map` and `sega_skip_lorebook_keys` config toggles allow skipping these stages independently.

#### Erato Compatibility

- **`erato_compatibility` toggle** — Config flag for interoperability with Erato scripts. When enabled: lorebook category `entryHeader` is cleared, `"----\n"` separators move into entry content, and a `"SE: End of Lorebook"` sentinel marker entry is created at insertion order 1. Toggling off restores standard formatting.

### Changed

- **EditableText** — New props: `initialDisplay` (shown on mount when content is empty, instead of "_No content._"), `formatDisplay` (optional display formatter), `singleLine` (compact single-line layout for titles/short fields).
- **Crucible context builder** — `buildCruciblePrefix` now accepts `{ includeBrainstorm, includeDirection }` options for finer control across generation stages.
- **Keys stop token** — Changed from `["\n\n", "\n---"]` to `["\n---"]` only, preventing premature cutoff before the `KEYS:` line in long relational maps.
- **Keys parser** — Requires a `KEYS:` line; no raw-text fallback. Logs and skips if absent rather than producing keys from unstructured output.

### Breaking Changes

- **Crucible state wiped on upgrade** — v7 state (with `chains`, `builder`, `autoChaining`) is automatically detected and replaced with a clean initial state via `migrateCrucibleState`. Scene cards and constraints are not preserved.
- **Scene-based workflow removed** — Scenes, scene budget, scene cards, constraints, and the solver/builder/director loop are gone. World-building is now: prerequisites → world elements.
- **`StructuralGoal` type removed** — Replaced by `CrucibleGoal` with a `why` field.
- **Generation request types** — `crucibleChain` and `crucibleBuild` replaced by `cruciblePrereqs`, `crucibleElements`, and `crucibleExpansion`.
- **Brainstorm state shape** — Existing single-session data is automatically wrapped into the first entry of the new `chats[]` array on load.

### Developer Notes

- 10 commits on v8 branch.
- `src/core/store/slices/crucible.ts`: complete rewrite — new `CrucibleGoal`, `Prerequisite`, `CrucibleWorldElement`, `CruciblePhase` types.
- New strategies: `crucible-strategy.ts` (direction, shape, goals), `crucible-chain-strategy.ts` (prereqs, elements, expansion).
- New handlers: `handlers/crucible.ts`, `handlers/crucible-chain.ts`.
- New/rewritten UI: `ReviewView`, `ProgressDisplay`, `GoalCard`, `IntentSection`, `GoalsSection`.
- Design docs removed from repo: `crucible-redesign.md`, `goal-redesign.md`, `lorebook-keys-redesign.md`, `CODEREVIEW.md`.

## [0.7.2] - 2026-02-18

### Changed

#### Crucible — Reverse Scene Numbering

- **Timeline-order scene labels** — Scene numbers now reflect story chronology: Scene 1 is the earliest (nearest origin), highest number is nearest the climax. Previously Scene 1 was the first _explored_ scene (nearest climax), which was confusing. `sceneNumber(index, maxScenes)` now computes `maxScenes - index`.
- **Scene budget stored on chain** — `CrucibleChain.sceneBudget` tracks the slider value, synced before each generation via new `sceneBudgetUpdated` action. UI components read this for label computation instead of making assumptions.
- **`EditableText` label targetable** — The label `text()` part now receives an id (`${id}-label`), enabling reactive label updates from parent components (e.g. scene labels updating when budget changes).
- **Chain prompt updated** — Scene numbering description in `crucible_chain_prompt` corrected to match reverse numbering: "Scene N is the first precursor to the climax, and Scene 1 is furthest back."
- **Director temporal position text fixed** — Was "next scene is the CLIMAX (Scene 1)"; now correctly says "Scene N (nearest to the climax)."

### Fixed

- **Orphaned storyStorage keys on goal deletion** — Deleting a goal now cleans up `cr-goal-{id}`, `cr-goal-section-{id}`, and all `cr-scene-{id}-*` keys from storyStorage. Previously these persisted indefinitely.
- **Orphaned storyStorage keys on scene deletion** — `scenesDeletedFrom` cleans up scene keys for deleted indices. `sceneRejected` cleans up the removed scene's key.

## [0.7.0] - 2026-02-17 — Crucible Edition

### Added

#### Crucible — Backward-Reasoning World Generator

The headline feature of 0.7.0. Crucible turns brainstormed ideas into a populated world by reasoning backward from dramatic endpoints. Scenes are scaffolding; world elements are the product.

- **New sidebar panel** — "Crucible" panel with hexagon icon, four-step progressive workflow.
- **Step 1: Direction** — AI distills the brainstorm into a single dense creative anchor (the Direction), or the user writes their own. Includes story architecture classification and thematic tags. All downstream generation references only this text.
- **Step 2: Goals** — AI generates dramatic endpoints — possible futures for the world. Each goal has a "Build World" button to begin world generation from that goal. Manual add/edit/delete supported.
- **Step 3: World Building** — The core loop. For each goal the user builds, three interleaved generators run:
  - **Solver** — Generates scenes backward from the climax, resolving and opening constraints. Each scene discovers what the world must contain. Scene numbering follows story chronology (Scene 1 = earliest).
  - **Builder** — Extracts world elements (characters, locations, factions, systems, situations) from new scenes. Can create new elements or update existing ones. Emits `[SOLVER]` to resume chaining.
- **Step 4: Review & Merge** — World elements merge into Story Engine's DULFS fields and lorebook.
- **Shared world state** — All goals contribute to and see the same world element inventory.
- **Scene budget** — Configurable per-goal scene limit (default 5). Termination is budgeted, not emergent.
- **Streaming-first** — All generation streams in real time. Scene cards and world elements appear as they're generated.

#### New UI Components

- **`EditableText`** — Reusable view/edit toggle component with markdown display, edit mode, optional label, format callbacks, and extra controls. Used throughout Crucible for direction, goals, and scenes.
- **`BudgetFeedback`** — Budget wait overlay component for generation feedback.
- **`CruciblePanel`** — Root panel composing Header, IntentSection, GoalsSection, and WorldBuildingView.
- **`CrucibleHeader`** — Status line, reset (with confirmation), and stop button.
- **`IntentSection`** — Direction editor with generate button.
- **`GoalsSection`** — Goal list with generate/add/clear/build-world controls.
- **`GoalCard`** — Edit, delete, build per goal.
- **`WorldBuildingView`** — Streaming text area, world element inventory, scene cards per goal.
- **`BuilderView`** — World element display organized by DULFS category.
- **`SceneCard`** — Collapsible scene display with edit/delete, favoriting.

#### New Utilities

- **`tag-parser.ts`** — Streaming-safe tagged text parser: `parseTag`, `parseTagAll`, `splitSections`, `formatTagsWithEmoji`, `restoreTagsFromEmoji`. Handles `[TAG] content` format used throughout Crucible.
- **`crucible-strategy.ts`** — Solver strategy factory. Builds context from direction, goal, existing scenes, open/resolved constraints, and world elements.
- **`crucible-builder-strategy.ts`** — Builder strategy factory. Reviews new scenes, extracts and updates world elements.
- **`buildCruciblePrefix`** in `context-builder.ts` — Separate prefix for Crucible generation (direction, story state, DULFS — no lorebook, no story text, no ATTG, no Style).

#### New Config Prompts

Five new configurable prompts in `project.yaml`:

- `crucible_intent_prompt` — Direction distillation from brainstorm.
- `crucible_goals_prompt` — Goal generation with starting constraints.
- `crucible_chain_prompt` — Scene generation (lean solver) with constraint discipline.
- `crucible_build_prompt` — Interleaved builder for world element extraction.

### Breaking Changes

- **DULFS list generation removed from S.E.G.A.** — The round-robin DULFS list population stage has been removed from SEGA. World population is now handled by Crucible. Users can still generate items per-category via individual "Generate Items" buttons.
- **`storyLoaded` / `brainstormLoaded` actions removed** — Replaced by unified `persistedDataLoaded` action that hydrates all slices (story, brainstorm, crucible) in a single dispatch.
- **`segaRoundRobinAdvanced` action removed** — No longer needed without DULFS list stage.
- **`MIN_ITEMS_PER_CATEGORY` constant removed** — DULFS population is now user-driven via Crucible.
- **`dulfsRoundRobin` state removed** from `SegaState`.
- **`SegaStage` changed** — `"dulfsLists"` replaced by `"bootstrap"`.

### Changed

#### S.E.G.A. Pipeline

- **Pipeline reordered** — Was: ATTG/Style → DULFS Lists → Canon → Lorebook. Now: ATTG/Style → Canon → Bootstrap → Lorebook. DULFS population delegated to Crucible.
- **Bootstrap integrated** — SEGA now automatically generates an opening scene instruction (Bootstrap) after Canon, if the document is empty. Previously Bootstrap was manual-only.
- **`queueSegaGeneration` simplified** — Renamed to `queueSegaFieldGeneration`; list-type generation path removed.

#### State Management

- **New `crucible` slice** — Fifth root state slice managing direction, goals, chains (scenes + constraints), world elements (builder state), and auto-chaining mode. Includes `migrateCrucibleState` for backward-compatible hydration.
- **Unified data hydration** — `persistedDataLoaded` action intercepts at root reducer level, hydrating story, brainstorm, and crucible state in one dispatch. Eliminates separate load actions and the `PersistedState` interface from `index.ts`.
- **New generation request types** — `crucibleDirection`, `crucibleGoal`, `crucibleChain`, `crucibleBuild`.
- **`continuation` field on `GenerationStrategy`** — Supports multi-call generations (solver→builder→solver loops) with configurable `maxCalls`.

#### Lorebook Templates

- **All templates condensed** — Shorter, denser format targeting ~80 words (was ~150). Focus on narrative function over encyclopedic detail.
- **Character template simplified** — Now: identity line, appearance (what a stranger notices), personality (behavior under pressure + defining quote), conflict (internal tension). Removed explicit BWH/measurements/physical stats fields.
- **Location/Faction/System/Dynamic templates tightened** — Each reduced to essential fields with emphasis on narrative potential and atmosphere over enumeration.

#### Lorebook Content Prompt

- **Content directives rewritten** — Characters focus on camera-visible appearance, behavior-driven personality, and volatility. General entries require every sentence to earn its tokens. Templates are starting points with field additions encouraged by genre context.

### Removed

- `storyLoaded` action — Replaced by `persistedDataLoaded`.
- `brainstormLoaded` action — Replaced by `persistedDataLoaded`.
- `segaRoundRobinAdvanced` action and `dulfsRoundRobin` state.
- `MIN_ITEMS_PER_CATEGORY` constant.
- DULFS list generation stage from SEGA pipeline.

### Developer Notes

- 33 files changed, 5,017 insertions, 191 deletions (net +4,826 lines).
- New crucible state slice: 632 lines (`src/core/store/slices/crucible.ts`).
- New effect handlers: `crucible.ts` (248 lines), `crucible-builder.ts` (149 lines).
- New strategy factories: `crucible-strategy.ts` (298 lines), `crucible-builder-strategy.ts` (173 lines).
- 11 new UI components across `src/ui/components/Crucible/` and shared utilities.
- Design docs: `crucible-design.md` (theory + implementation), `crucible-ux.md` (user experience spec).

## [0.6.0] - 2026-02-11

### Breaking Changes

- **nai-act 0.2.0** — `describe()` + `onMount()` merged into a single `build(props, ctx)` method. `mount()` now returns `{ part, unmount }` instead of a bare cleanup function. All components must be updated.
- **`createEvents` removed** — The Proxy-based event bus (`createEvents`, `events` property, `E` type parameter) has been removed from nai-act. Event handlers are now plain functions declared in `build()`.
- **`requestsSynced` reducer removed** — Replaced by `requestActivated` and `queueCleared`. Any code dispatching `requestsSynced` must migrate.
- **`cancelCurrent()` renamed to `cancelAll()`** on GenX — matches actual behavior (clears entire queue).
- **Lorebook cross-reference context removed** — `lorebook-context.ts` deleted; DULFS summaries provide sufficient context. Config fields `lorebook_context_budget`, `lorebook_story_context_budget`, `lorebook_keys_context_budget` removed.
- **`useSelector` no longer fires on subscribe** — Listeners only fire on subsequent state changes, not immediately with the current value.

### Changed

#### Framework Refactors (`lib/`)

- **nai-act: Unified lifecycle** — Components define a single `build(props, ctx)` method that returns UIParts and sets up subscriptions in one phase. Eliminates the split-brain bug class where `describe()` renders UI but `onMount()` is forgotten (or vice versa).
- **nai-act: `ctx.render()`** — New `BindContext` method that mounts a child component and returns `{ part, unmount }`. Replaces the separate `Child.describe(props)` + `ctx.mount(Child, props)` pattern. Consumers: TextField, ListField, LorebookPanelContent, Header, brainstorm/List, brainstorm/Input.
- **GenX: Constructor hooks** — New `GenXHooks` interface (`onStateChange`, `onTaskStarted`, `beforeGenerate`) passed via constructor. `onTaskStarted` fires when a task is picked off the queue, enabling direct store sync without reconciliation.
- **GenX: `cancelCurrent()` → `cancelAll()`** — Name now reflects that the method clears the entire queue, not just the active task.

#### State Management

- **Runtime slice rewrite** — `requestsSynced` (bulk reconciliation) replaced by `requestActivated` (moves single request from queue → activeRequest) and `queueCleared` (bulk reset). `requestCompleted` now nulls `activeRequest` directly and dispatches unconditionally (including on cancellation).
- **Reconciliation effect eliminated** — The 43-line effect that polled `genX.getTaskStatus()` and manually synced queue state is gone. GenX's `onTaskStarted` hook handles the transition directly.
- **Brainstorm queue tracking** — Brainstorm effects now dispatch `requestQueued` before `generationSubmitted`, fixing missing queue status for brainstorm generations.

#### Context & Generation

- **Unified prefix reordered** — MSG 2 (story state snapshot) now orders sections as ATTG/Style first (tone anchors), then setting/brainstorm (foundational), then canon last (synthesis). Story text moved to MSG 4 (volatile, at end) with `contextLimitReduction: 8000`.
- **S.E.G.A. pipeline reordered** — Was: Canon → ATTG/Style → DULFS → Lorebook. Now: ATTG/Style → DULFS → Canon → Lorebook. Canon is generated after world entries so it can synthesize from them.
- **DULFS field order changed** — Dramatis Personae now generates first (was third), followed by Universe Systems, Locations, Factions, Situational Dynamics.
- **Bootstrap origin metadata** — `appendParagraph` / `updateParagraph` calls now include `origin` arrays, enabling proper tracking of generated instruction blocks in the document.

#### UI

- **All components migrated to `build()` lifecycle** — GenerationButton, TextField, ListField, ListItem, ButtonWithConfirmation, LorebookPanelContent, Header, FieldList, SettingField, brainstorm/Input, brainstorm/List, brainstorm/Message.
- **`buttonRegistry` removed** — ButtonWithConfirmation no longer needs a per-instance registry; handlers are scoped naturally in `build()`.
- **Store singleton import removed** — LorebookPanelContent no longer imports the store directly; all state access goes through `ctx`.
- **Declarative panel composition** — `index.ts` now mounts components first, then composes returned `part` values into panel declarations. Lorebook GenerationButtons are handled internally by LorebookPanelContent instead of being mounted separately with complex prop wiring.

### Removed

- `lorebook-context.ts` — Lorebook cross-reference context (127 lines). DULFS summaries provide sufficient cross-referencing.
- `createEvents` / `EventMap` / `AugmentedEvents` — Proxy-based event system from nai-act.
- `requestsSynced` reducer and GenX reconciliation effect (43 lines).
- Config fields: `lorebook_context_budget`, `lorebook_story_context_budget`, `lorebook_keys_context_budget`.

### Fixed

- **S.E.G.A. completion signal** — `requestCompleted` now fires unconditionally (including on cancellation), preventing SEGA from getting stuck when a generation is cancelled mid-flight.
- **Stale active request** — `requestCompleted` nulls `activeRequest` immediately instead of setting an intermediate "completed" status, eliminating ghost active-request state.

### Developer Notes

- Net -540 lines (978 additions, 1518 deletions) across 29 files.
- `CODEREVIEW.md` updated: 7 TODOs resolved (→ DONE), with notes on remaining items.
- nai-act bumped to 0.2.0.

## [0.5.0] - 2026-02-07

### Breaking Changes

- **Story Prompt → Canon** — The "Story Prompt" field has been replaced by "Canon," a denser authoritative-facts format (world, characters, structure, tone). Existing Story Prompt content will not migrate automatically.
- **World Snapshot removed** — The Dynamic World Snapshot field and its generation prompt have been removed. Canon absorbs its purpose.
- `prefixBehavior` renamed to `prefillBehavior` across all generation strategies.

### Added

#### Unified Prefix & Token Cache Strategy

- **`buildStoryEnginePrefix()`** — All Story Engine strategies now share a common 4-message prefix (system prompt + weaving, cross-reference entries, story state snapshot, DULFS items). This maximizes token cache hits across sequential generations.
- **Cache instrumentation** — Every generation logs `[cache] label: N uncached tokens` for monitoring cache efficiency.
- **Lorebook cross-reference context** (`lorebook-context.ts`) — Injects existing lorebook entries into generation context with configurable token budget, enabling richer and more consistent worldbuilding.
- **Hash-sorted entry ordering** (`seeded-random.ts`) — Lorebook entries are sorted by `hash(storyId + entryId)` so new entries slot into position without shifting others, producing append-only cache growth during S.E.G.A.

#### Canon & Bootstrap

- **Canon field** — Replaces Story Prompt with a structured authoritative-facts format: World, Characters, Structure (with named narrative architectures like Three-Sphere, Powder Keg, Intimate Power, etc.), and Tone.
- **Bootstrap** — New "Bootstrap" button generates a self-contained opening scene instruction from Canon + world state, then streams it into the document as an instruct block. Requires new `documentEdit` permission.

#### Lorebook Improvements

- **Lorebook Refinement** — New "Refine" button in the Lorebook panel lets you modify an existing entry with natural language instructions (e.g., "make her taller," "add a rivalry with X").
- **Anchored prefills** — Lorebook content generation now prefills `Name/Type/Setting` header lines, and keys generation prefills the entry name as the first key. Produces more consistent formatting.
- **Configurable budgets** — New config fields: `lorebook_context_budget`, `lorebook_story_context_budget`, `lorebook_keys_context_budget`, `lorebook_weaving_prompt`.
- **`entryHeader` on categories** — Lorebook categories now set `entryHeader: "----"` for proper entry formatting.

#### UI Enhancements

- **Status border indicators** — DULFS list sections show colored left borders: gray (empty), yellow (queued), orange (generating), white (complete).
- **Brainstorm tracking button** — New button in brainstorm input to track ongoing brainstorm generations.
- **Dynamic textarea heights** — DULFS item textareas auto-resize based on stored content length.

### Changed

- **Prompt rewrites** — Canon, lorebook content, lorebook keys, ATTG, brainstorm, and situational dynamic prompts have all been substantially rewritten for higher quality output.
  - Characters now require full physical stats (height, weight, BWH, etc.) and emphasize susceptibilities over predetermined roles.
  - Keys prompt rewritten to focus on activation prediction ("If a scene mentions [key], should this entry be in context?").
  - Situational Dynamics renamed to Narrative Vectors with competing-pressures framing.
- **S.E.G.A. overhaul** — Completion handler now runs before `requestCompleted` dispatch (fixes stale-state scheduling bugs). Paired content+keys requests must both finish before the next entry is scheduled. Added extensive logging throughout.
- **Story context filtering** — `getStoryContextMessages()` now filters out user messages, Author's Note, and strips prefill from assistant messages for cleaner context injection.
- **Generation parameters tuned** — Brainstorm temperature raised to 0.95 with presence penalty. Lorebook content gets `frequency_penalty: 0.1`. Keys get `frequency_penalty: 0.3` with higher max tokens (96). List generation gets `frequency_penalty: 0.15`.
- **`requestCompleted` reducer** — Now also removes the request from the queue (handles race where GenX finishes before state sync).
- **Story clear** — Now flushes runtime queue so border selectors re-evaluate immediately.
- Brainstorm system prompt softened ("creative writing partner" / "story ideas").

### Fixed

- S.E.G.A. double-generation bug — scheduling next entry before keys finished caused duplicate lorebook entries.
- S.E.G.A. getting stuck — failed generations now always signal `requestCompleted` so the scheduler advances.
- Completion handler errors no longer prevent `requestCompleted` dispatch (wrapped in try/catch).
- Story context messages correctly filter out the first system prompt message.
- Markdown stripping in output filters.

### Developer Notes

- New test suite: `tests/core/utils/cache-ordering.test.ts` — validates unified prefix structure, hash-sort stability, and cache efficiency invariants.
- `seededShuffle` and `stableOrderWithNewAtEnd` utilities available in `seeded-random.ts`.
- `applyFieldFilters` / `applyFilter` in `filters.ts` for post-generation text cleanup.

## [0.4.0] - 2026-02-04

### Breaking Changes

- **Complete architectural rewrite** — This version is not compatible with data from previous versions. Install in a new story.
- Removed legacy services: `agent-workflow.ts`, `hyper-generator.ts`, `story-manager.ts`, `sega-service.ts`, `lorebook-sync-service.ts`, and others.
- Removed `GEMINI.md`, `PLAN.md`, `CODEREVIEW.md` planning documents.

### Added

#### New Framework Libraries (`lib/`)

- **nai-store.ts** — Redux-like state management with `createSlice`, `dispatch`, `useSelector`, and `subscribeEffect` for side effects.
- **nai-act.ts** — Component framework with `describe()` for static UI structure and `onMount()` for reactive subscriptions.
- **gen-x.ts** — Complete rewrite of generation queue engine with budget management, pause/resume, and pub/sub state updates.

#### New Store Architecture (`src/core/store/`)

- Centralized state management with four slices:
  - `story` — Field contents and DULFS items
  - `brainstorm` — Chat messages
  - `ui` — Edit modes, temporary inputs, lorebook selection
  - `runtime` — Generation queue status, GenX state, SEGA orchestration
- Effects system for side effects triggered by state changes
- Automatic persistence via `api.v1.storyStorage`

#### New UI Components (`src/ui/components/`)

- `GenerationButton` — Unified generation button with queue status, timer display, and cancellation
- `ButtonWithConfirmation` — Reusable confirmation dialog pattern
- `TextField` — Text/multiline field with edit mode toggle and generation
- `ListField` / `ListItem` — DULFS list management with lorebook sync
- `LorebookPanelContent` — Lorebook panel for generating entry content and keys
- Brainstorm components: `List`, `Input`, `Message`
- Sidebar components: `Header`, `SettingField`, `FieldList`

#### New Features

- **Lorebook Panel** — Generate content and keys for any lorebook entry directly from the Lorebook view.
- **ATTG & Style Sync** — Author/Title/Tags/Genre syncs to Memory, Style Guidelines syncs to Author's Note.
- **Setting Field** — Quick setting input (e.g., "Star Wars", "Original") for non-original fanfiction contexts.
- **Improved S.E.G.A.** — Round-robin scheduling across DULFS categories, status display, proper cancellation.
- **JIT Strategy Building** — Message factories build generation context at execution time, not queue time.

### Changed

- Generation uses `api.v1.generate()` directly via GenX instead of the old HyperGenerator wrapper.
- All UI updates use `api.v1.ui.updateParts()` — no re-rendering, just targeted mutations.
- Element IDs centralized in `src/ui/framework/ids.ts` with consistent prefixes.
- Context building moved to `src/core/utils/context-builder.ts` with layered prompt construction.
- Lorebook strategies extracted to `src/core/utils/lorebook-strategy.ts`.

### Removed

- `hyper-generator.ts` — Replaced by GenX.
- `agent-workflow.ts` — Replaced by effects system.
- `story-manager.ts`, `story-data-manager.ts` — Replaced by store slices.
- `brainstorm-service.ts`, `brainstorm-data-manager.ts` — Replaced by store + effects.
- `sega-service.ts` — Replaced by `effects/sega.ts`.
- `lorebook-sync-service.ts` — Replaced by effects in `effects.ts`.
- `unified-generation-service.ts`, `dulfs-service.ts` — Replaced by generation handlers.
- `context-strategies.ts`, `field-strategies.ts` — Replaced by `context-builder.ts`.
- `brainstorm-ui.ts`, `story-engine-ui.ts`, `structured-editor.ts` — Replaced by nai-act components.
- `ui-components.ts` — Replaced by individual component files.
- `debouncer.ts` — No longer needed with new architecture.
- `subscribable.ts` — Replaced by nai-store subscriptions.

### Fixed

- Streaming lag in brainstorm chat resolved.
- Generation button state properly reflects queue status.
- Pause/resume behavior works correctly during generation.
- Lorebook entries update immediately when DULFS item names change.

### Developer Notes

- See `CLAUDE.md` for coding guidelines and architecture overview.
- Strict TypeScript: `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- Test coverage is minimal (~6%) — expansion planned for v0.5.
