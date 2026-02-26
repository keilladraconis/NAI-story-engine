# Changelog

All notable changes to this project will be documented in this file.

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

- **Timeline-order scene labels** — Scene numbers now reflect story chronology: Scene 1 is the earliest (nearest origin), highest number is nearest the climax. Previously Scene 1 was the first *explored* scene (nearest climax), which was confusing. `sceneNumber(index, maxScenes)` now computes `maxScenes - index`.
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
