# PLAN-v11.md — Implementation Plan

Reference: `FUTURE.md` for design rationale and UI sketches.

---

## Phase 0: Rename and Reorganize (Foundation) ✅

**Goal:** Establish v11 naming conventions and state structure without changing behavior.

### 0.1 — Rename "Merge" to "Cast" ✅

- `src/core/store/slices/crucible.ts`: Rename `crucibleMergeRequested` → `crucibleCastRequested`, `mergeCompleted` → `castCompleted`, `merged` → `cast` in `CrucibleState`
- `src/core/store/effects/crucible-effects.ts`: Update action references
- `src/ui/components/Crucible/BuildPassView.ts`: Update button label "Merge to Story" → "Cast"
- Updated test file, `ids.ts` (`MERGE_BTN` → `CAST_BTN`)

### 0.2 — Introduce Batch and Relationship Types ✅

New types in `src/core/store/types.ts` (`WorldBatch`, `WorldEntity`, `Relationship`, `EntityLifecycle`, `WorldState`, `FoundationState`, `Tension`):

```ts
type EntityLifecycle = "draft" | "live"

type WorldBatch = {
  id: string
  name: string           // "Main", "Rusty Anchor Regulars", etc.
  entityIds: string[]    // ordered
}

type Relationship = {
  id: string
  fromEntityId: string
  toEntityId: string
  description: string
}

type WorldEntity = {
  id: string
  batchId: string
  categoryId: FieldID    // Character, Location, etc. — metadata
  lifecycle: EntityLifecycle
  lorebookEntryId?: string  // set on Cast, cleared on Reforge
  name: string
  summary: string        // engine-derived, read-only display
}
```

### 0.3 — New State Slice: `world.ts` ✅

Created `src/core/store/slices/world.ts`:

- State: `{ batches: WorldBatch[], entities: WorldEntity[], relationships: Relationship[] }`
- Actions: `entityForged`, `entityCast`, `entityReforged`, `entityDeleted`, `entitySummaryUpdated`, `batchCreated`, `batchRenamed`, `batchReforged`, `relationshipAdded`, `relationshipRemoved`, `relationshipUpdated`, `entityBound`, `entityUnbound`

### 0.4 — New State Slice: `foundation.ts` ✅

Created `src/core/store/slices/foundation.ts`:

- State: `{ shape, intent, worldState, tensions: Tension[], attg, style, attgSyncEnabled, styleSyncEnabled }`
- Actions: `shapeUpdated`, `intentUpdated`, `worldStateUpdated`, `tensionAdded`, `tensionEdited`, `tensionResolved`, `tensionDeleted`, `attgUpdated`, `styleUpdated`, `attgSyncToggled`, `styleSyncToggled`

### 0.5 — Add `world` and `foundation` to Store ✅

- Added `WorldState`, `FoundationState`, `Tension` types to `src/core/store/types.ts`
- Added `world` and `foundation` to `RootState`
- Wired into `combineReducers` and exported from `src/core/store/index.ts`
- **Deferred:** Deletion of `story.ts` and `crucible.ts` slices — kept alive until Phase 1 UI replaces them (per Phase 8 guidance: don't delete old code until new code works)

---

## Phase 1: Unified Story Engine Panel ✅

**Goal:** Merge Crucible and Story Engine sidebars into one panel.

### 1.1 — Narrative Foundation UI ✅

Created `src/ui/components/Foundation/NarrativeFoundation.ts` + `TensionRow.ts`:
- Collapsible "Narrative Foundation" section with Shape, Intent, World State, Tensions, ATTG, Style
- Tensions use `bindList` with active/resolved split; resolved header hides reactively
- ATTG/Style: `multilineTextInput` + sync checkbox (ATTG→Memory, Style→AN)
- Added signal actions: `shapeGenerationRequested`, `intentGenerationRequested`, `worldStateGenerationRequested`

### 1.2 — Forge Section UI ✅

Created `src/ui/components/Forge/ForgeSection.ts` + `ForgeEntityRow.ts`:
- Collapsible "Forge" section with intent input, Forge + Forge from Brainstorm buttons, batch name, draft entity list, Cast All / Discard All
- Draft entity list via `bindList(ForgeEntityRow)`; Cast/Discard row hides when no draft entities
- `entityDiscardRequested` and `discardAllRequested` are immediate reducers (entities removed from state)
- `forgeRequested`, `castAllRequested` are signals (Phase 2 adds effects)

### 1.3 — World Batches UI ✅

Created `src/ui/components/World/BatchSection.ts`, `EntityRow.ts`, `WorldBatchList.ts`:
- `WorldBatchList`: container, renders one `BatchSection` per batch via `bindList`
- `BatchSection`: collapsible section per batch, title updates reactively with live entity count; entity list via `bindList(EntityRow)`
- `EntityRow`: name + summary row with tap-to-expand action bar (`[⟲ Reforge] [⚡ Regen] [✕ Delete]`)
- Reforge dispatches `entityReforged` directly (Phase 2 adds lorebook cleanup effect)
- Delete dispatches `entityDeleted` (removes entity + relationships from state)

### 1.4 — Compose the Unified Panel ✅

Updated `src/index.ts`:
- Removed `kse-crucible-sidebar` panel
- `kse-sidebar` now: Header → NarrativeFoundation → ForgeSection → WorldBatchList → Footer (Relationships / Bind New / Rebind stubs)
- Crucible effects unregistered from `register-effects.ts`
- world + foundation state included in autosave and `persistedDataLoaded`

### 1.5 — Retire Old Sidebar Components ✅

- Deleted `src/ui/components/Crucible/` (all 7 files)
- Deleted `src/ui/components/Sidebar/FieldList.ts`
- Deleted `src/ui/components/Fields/TextField.ts`, `ListField.ts`, `ListItem.ts`
- Kept `src/ui/components/Sidebar/Header.ts`

---

## Phase 2: Forge Engine (Crucible Rewrite) ✅

**Goal:** Make the forge always-available, intent-driven, and batch-aware.

### 2.1 — Intent-Driven Forge Strategy ✅

Create `src/core/utils/forge-strategy.ts`:

- `buildForgeStrategy(getState, intent, batchContext?)`: Builds a generation strategy that:
  - Reads Narrative Foundation (shape, intent, world state, tensions, ATTG, style)
  - Reads all Live entities for world awareness
  - Reads batch members if Reforging an existing batch
  - Reads brainstorm context if `[Forge from Brainstorm]`
  - Produces BUILD/LINK commands (reuse command vocabulary from `crucible-command-parser.ts`)
  - System prompt emphasizes "Main" batch semantics for first forge

### 2.2 — Forge Handler ✅

Create `src/core/store/effects/handlers/forge.ts`:

- Reuse `parseCommands()` and `executeCommands()` from `crucible-command-parser.ts`
- Commands dispatch to `world` slice: `entityForged`, `relationshipAdded`, etc.
- Entities land in draft state within the current Forge batch
- Auto-generate batch name from intent if not set

### 2.3 — Forge Effects ✅

Create `src/core/store/effects/forge-effects.ts`:

- Handle `forgeRequested` action → build strategy → submit to GenX
- Handle `forgeFromBrainstormRequested` → same, with brainstorm context injected
- Handle `batchReforgeRequested` → lift batch to Forge, set batch name + context

### 2.4 — Cast Flow ✅

Update `src/core/store/effects/sega.ts` or create new `cast-effects.ts`:

- Handle `castRequested` action:
  1. Move draft entities to Live state
  2. Create lorebook entries for each entity (`api.v1.lorebook.createEntry()`)
  3. Set `lorebookEntryId` on each WorldEntity
  4. If batch name matches existing → merge entities into that batch
  5. If new name → create new batch
  6. Trigger SEGA realization for new entities (content, keys)
- Handle `discardRequested`:
  - Freshly forged (never Cast) → remove from world state
  - Reforged (was Live) → return to Live unchanged, restore to original batch

### 2.5 — Reforge Flow ✅

- `batchReforgeRequested`: All entities in batch → draft, batch lifts to Forge section with existing members as context
- `entityReforgeRequested`: Single entity → draft, lifted to Forge. Batch name pre-filled with original batch name.

### 2.6 — Retire Old Crucible Pipeline ✅

- Delete `src/core/utils/crucible-strategy.ts` (shape/direction/tension factories)
- Delete `src/core/utils/crucible-build-strategy.ts` (replaced by forge-strategy)
- Keep `src/core/utils/crucible-command-parser.ts` (reused by forge handler)
- Keep `src/core/utils/crucible-world-formatter.ts` (reused for forge context)
- Delete `src/core/store/effects/crucible-effects.ts`
- Delete `src/core/store/effects/handlers/crucible.ts`, `crucible-build.ts`
- Delete `src/core/store/slices/crucible.ts` (replaced by `world.ts` + `foundation.ts`)

---

## Phase 3: SEGA Rewrite ✅

**Goal:** Simplify SEGA — remove relational maps, run on Cast, support incremental realization.

### 3.1 — Simplify SEGA Stages

Current: ATTG → Style → Canon → Bootstrap → Content → Relational Map → Reconcile → Keys
New: Content → Keys (per entity)

ATTG, Style, Intent, World State generation moves to Narrative Foundation (on-demand, not SEGA-driven). Bootstrap stays as a separate action. Relational maps and reconciliation are eliminated.

### 3.2 — SEGA Runs on Cast

- Trigger: `castCompleted` action (after entities are Live with lorebook entries)
- For each newly Cast entity without content: generate lorebook content
- For each newly Cast entity without keys: generate keys
- Existing SEGA "generate all" button still works — finds all Live entities needing content/keys

### 3.3 — Update SEGA State

Simplify `SegaState`:
- Remove `relationalMaps`, `relmapsCompleted` fields
- Remove `lorebookRelationalMap` and `lorebookRelationalMapReconcile` stages
- Keep `lorebookContent` and `lorebookKeys` stages

### 3.4 — Update Lorebook Strategy

- `src/core/utils/lorebook-strategy.ts`: Remove `createLorebookRelationalMapFactory`, `MAP_DEPENDENCY_ORDER`, `parseNeedsReconciliation`
- Keys factory: Use relationship data from `world.relationships` instead of ephemeral relational maps
- Content factory: Include relationship context from `world.relationships` for the entity

### 3.5 — Update Context Builder

- `src/core/utils/context-builder.ts`:
  - `buildStoryEnginePrefix()`: Read from `foundation` and `world` slices instead of `story` and `crucible`
  - Include relationship data in entity context blocks
  - Remove relational map references

---

## Phase 4: Lorebook Extension Update ✅

**Goal:** Add lifecycle awareness, relationship editing, Bind/Unbind to the script tab.

### 4.1 — Managed Entry View

Update `src/ui/components/Lorebook/LorebookPanelContent.ts`:

- If entry is managed by SE:
  - Show lifecycle state (draft/live)
  - Show relationships list with `[+ Add Relationship]`
  - Show `[⚡ Regen Content]`, `[⚡ Regen Keys]`, refine controls
  - Show `[⟲ Reforge Entity]`, `[✕ Unbind]`

### 4.2 — Unmanaged Entry View

- If entry is NOT managed:
  - Show `[⚡ Bind to Story Engine]`
  - Show category cycle button (auto-detected from `Type:` line)

### 4.3 — Relationship Editing

- Add/remove/edit relationships for the selected entity
- Relationship target: cycle button through existing managed entities (or text input for entity name)
- Dispatches to `world` slice: `relationshipAdded`, `relationshipRemoved`, `relationshipUpdated`

---

## Phase 5: Bind System

**Goal:** Allow users to adopt existing lorebook entries into Story Engine.

### 5.1 — Single Bind (Lorebook Extension)

- `[⚡ Bind to Story Engine]` on unmanaged entry:
  - Auto-detect category from `Type:` line, fallback Topics
  - Create WorldEntity in Live state with `lorebookEntryId` set
  - Add to "Imported" batch (create if doesn't exist)
  - Dispatch `entityBound`

### 5.2 — Bulk Bind Modal

Create `src/ui/components/Bind/BindModal.ts`:

- Scan `api.v1.lorebook.entries()`, diff against managed entities
- Show unmanaged entries with `checkboxInput` toggles and category cycle buttons
- `[Bind Selected]` creates WorldEntities in "Imported" batch
- Wire to `[Bind New]` button in Story Engine panel footer

### 5.3 — Rebind Modal

Extend BindModal for `[Rebind]`:

- Show managed entries with content drift (lorebook text changed)
- Show managed entries deleted from lorebook
- Show new unmanaged entries since last bind
- Options: accept changes, recreate deleted, unbind stale

### 5.4 — Category Auto-Detection

Create `src/core/utils/category-detect.ts`:

- `detectCategory(entryText: string): FieldID` — pattern-match `Type:` line
- Mapping table per FUTURE.md spec
- Fallback: `FieldID.Topics`

---

## Phase 6: Relationships Modal

**Goal:** Whole-web relationship overview accessible from the Story Engine panel.

### 6.1 — Relationships Modal UI

Create `src/ui/components/Relationships/RelationshipsModal.ts`:

- Opens via `api.v1.ui.modal.open()`, size `"large"`
- Lists all relationships grouped by entity
- Each row: `Entity A → Entity B — description`
- Edit/delete per relationship
- `[+ Add]` button for manual relationship creation

---

## Phase 7: Lorebook Sync

**Goal:** Eventual consistency between Story Engine state and NovelAI lorebook.

### 7.1 — Reconciliation on Context Build

Update or create hook in `src/core/store/effects/lorebook-sync.ts`:

- Register `onBeforeContextBuild` hook
- Diff managed entities against `api.v1.lorebook.entries()`
- Detect: text changes, key changes, deletions
- Update WorldEntity summaries from lorebook content
- Flag missing entries in world state

### 7.2 — Reconciliation on Entry Selected

- Existing `onLorebookEntrySelected` hook: also refresh managed entry state

---

## Phase 8: Cleanup

**Goal:** Remove dead code and unused references.

### 8.1 — Delete Dead Code

- Delete `src/core/utils/crucible-strategy.ts`
- Delete `src/core/utils/crucible-build-strategy.ts`
- Delete `src/core/store/effects/crucible-effects.ts`
- Delete `src/core/store/effects/handlers/crucible.ts`
- Delete `src/core/store/effects/handlers/crucible-build.ts`
- Delete lorebook relational map handler code from `src/core/store/effects/handlers/lorebook.ts`
- Remove `MAP_DEPENDENCY_ORDER`, `parseNeedsReconciliation` from `lorebook-strategy.ts`
- Delete `src/ui/components/Crucible/` (entire directory)
- Delete `src/ui/components/Fields/` (entire directory)
- Delete `src/ui/components/Sidebar/FieldList.ts`
- Clean up `src/ui/framework/ids.ts` — remove unused IDs/storage keys

### 8.2 — Update Tests

- Update test mocks in `tests/setup.ts` for new state shape
- Migrate existing tests to reference `world` and `foundation` slices
- Add tests for: forge strategy, cast flow, discard flow, reforge flow, bind, category detection, relationship CRUD

---

## Phase Order and Dependencies

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3
  (rename)    (UI)       (forge)     (SEGA)
                │
                ├──→ Phase 4 (lorebook ext)
                │
                ├──→ Phase 5 (bind)
                │
                └──→ Phase 6 (relationships modal)

Phase 3 + 4 + 5 ──→ Phase 7 (sync)

All phases ──→ Phase 8 (cleanup)
```

Phases 4, 5, 6 can run in parallel after Phase 1. Phase 7 depends on the sync surfaces existing. Phase 8 is last — don't delete old code until the new code works.

---

## Risk Areas

- **Forge prompt engineering:** The forge needs to produce good holistic clusters from intent text. The current Crucible build pass prompts are tuned for the tension→build flow. New prompts needed for intent-driven generation.
- **Batch naming by LLM:** Auto-generating a good batch name from forge output. May need iteration on the prompt or a separate lightweight generation call.
- **Cast + SEGA coordination:** SEGA needs to know which entities are newly Cast and need realization vs already realized. The `lorebookEntryId` presence + content check should be sufficient.
- **Mobile UX:** Tap-to-expand action bars need to feel responsive. NovelAI's UI update latency may make this feel sluggish — test early.
