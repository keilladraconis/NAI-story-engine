# Code Review: Story Engine (January 2026)

## Overview
The Story Engine codebase is well-structured, following service-oriented and strategy patterns. It demonstrates a clear separation between data management, workflow orchestration, and UI rendering.

---

## HIGH Priority

### 1. Brittle Field Syncing Logic [FINISHED]
**Location:** `StoryManager.syncToIndividualKeys`
**Finding:** The service manually lists "text fields" (StoryPrompt, Brainstorm, etc.).
**Issue:** If a new field is added to `field-definitions.ts`, it must be manually added to this list. This is an anti-pattern that leads to "forgotten" fields not being synced.
**Refactor:** Centralize the categorization of fields (e.g., `isTextField`, `isListField`) within `field-definitions.ts` or as static helpers on `FieldID`.
**Status:** Completed. Field metadata (fieldType, hidden) added to FIELD_CONFIGS. TEXT_FIELD_IDS and LIST_FIELD_IDS are now derived from configurations. StoryManager and StoryDataManager refactored to be data-driven.

### 2. Dual-Storage Desync Risk [FINISHED]
**Location:** `StoryManager.setFieldContent`, `StructuredEditor`, `field-strategies.ts`
**Finding:** The system uses both a global blob (`kse-story-data`) and individual keys (`kse-field-${fieldId}`) for persistence.
**Issue:** UI components often bind directly to `storageKey` (e.g., `createToggleableContent`). While this provides "free" persistence, it can bypass the `StoryManager` logic (like sync to AN/Memory) unless the `onChange` callback perfectly mirrors the global state.
**Refactor:** Removed `storageKey` from UI components (`createToggleableContent`, `multilineTextInput`). `StoryManager` is now the *only* entity that performs `api.v1.storyStorage.set` for core data. UI components use `initialValue` + `onChange` and are driven by the central `StoryManager` state.
**Status:** Completed. Refactored UI components and strategies to remove direct storage binding.

### 3. Logic Bloat in `RefineStageHandler` [FINISHED]
**Location:** `src/core/stage-handlers.ts`
**Finding:** The `overrideGeneration` method in `RefineStageHandler` is nearly 200 lines of complex text patching, regex cleaning, and iterative generation logic.
**Issue:** This makes the handler difficult to unit test and violates the Single Responsibility Principle.
**Refactor:** Extract the iterative patching and "cleaning" logic (prefixes like `REPLACEMENT TEXT:`) into `ReviewPatcher` or a new `PatchingService`.
**Status:** Completed. Logic for parsing, merging, and cleaning patches extracted into `ReviewPatcher`. `RefineStageHandler` refactored to use these centralized methods.

---

## MEDIUM Priority

### 1. Unified Context Strategies [FINISHED]
**Location:** `src/core/context-strategies.ts`
**Finding:** `getShortDulfsContext` and `getAllDulfsContext` are substantially similar.
**Issue:** Code duplication for building world element strings.
**Refactor:** Created a single `buildDulfsContextString(manager, mode: 'short' | 'full', excludeId?: string)` helper.
**Status:** Completed. Unified DULFS context building into a single strategy helper.

### 2. Wonky Prompt Workarounds (`fixSpacing`)
**Location:** `src/core/context-strategies.ts`
**Finding:** `fixSpacing` (doubling `\n`) is called manually on almost every string in every strategy.
**Issue:** This is a leak of model-specific quirks (GLM-4.6) into the high-level strategy logic.
**Refactor:** Move this into `hyperContextBuilder` or a dedicated prompt-assembly service so strategies can work with clean strings.

### 3. Dynamic Property Access (Type Safety)
**Location:** `StoryDataManager.getStoryField`, `StoryManager.addDulfsItem`
**Finding:** Frequent use of `(data as any)[fieldId]`.
**Issue:** This bypasses TypeScript's type checking for the `StoryData` interface.
**Refactor:** Use a discriminated union or a strict mapping object to access fields by ID, ensuring that the compiler knows whether it's getting a `StoryField` or a `DULFSField[]`.

### 4. Wand Session Inconsistency
**Location:** `InlineWandStrategy` (in `field-strategies.ts`) vs `StandardFieldStrategy`
**Finding:** `InlineWandStrategy` automatically starts an agent session if one doesn't exist.
**Issue:** This means fields like "World Snapshot" have a persistent session object in memory forever, while "Synopsis" (standard) does not. This leads to diverging logic paths in how "current content" is displayed during generation.

---

## LOW Priority

### 1. Dead Code & Comments
**Location:** `StructuredEditor.createFieldSection`
**Finding:** Comments still refer to "Generic Wand (Legacy)" and "Removed".
**Action:** Clean up comments and ensure `ActiveWandStrategy` remnants are fully purged.

### 2. Brainstorm Delegate Overload
**Location:** `StoryManager.ts`
**Finding:** `StoryManager` has multiple methods (`getBrainstormMessages`, `addBrainstormMessage`, etc.) that simply wrap `BrainstormDataManager`.
**Action:** While this keeps the API flat, it's starting to bloat `StoryManager`. Consider exposing the data managers directly or grouping them.

### 3. Inconsistent UUID Usage
**Location:** `AgentWorkflowService` vs `ListFieldStrategy`
**Finding:** `AgentWorkflowService` generates IDs during generation, but `ListFieldStrategy` generates them during manual "Add Entry".
**Action:** Centralize entity creation in `StoryManager` to ensure consistent defaults.

---

## Refactoring Roadmap

1.  **Phase 1 (Centralization)**: Move field metadata (type, layout, sync-targets) into `FieldID` or a metadata registry. Update `StoryManager` and `HistoryService` to use this registry.
2.  **Phase 2 (Decoupling)**: Extract patching/cleaning logic from `RefineStageHandler`.
3.  **Phase 3 (Prompting)**: Move `fixSpacing` into the `hyper-generator` wrapper or a prompt-building utility.
4.  **Phase 4 (Type Safety)**: Refactor `StoryDataManager` to use typed accessors for fields.
