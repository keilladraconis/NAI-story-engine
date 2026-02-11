# Changelog

All notable changes to this project will be documented in this file.

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
