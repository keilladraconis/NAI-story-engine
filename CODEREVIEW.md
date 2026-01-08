# Code Review: Story Engine (January 2026)

## Overview
The Story Engine codebase has undergone a successful simplification, moving from a complex multi-stage agentic workflow to a streamlined, strategy-based architecture. The core data management is centralized, and the UI is data-driven. However, some critical gaps remain in data persistence (export/import) and some minor architectural inconsistencies persist.

---

## HIGH Priority

### 1. Incomplete Data Export/Import
**Location:** `StoryEngineUI.exportStoryData` and `importStoryData`
**Finding:** These methods only iterate over `FieldID` and use `getFieldContent`/`setFieldContent`. 
**Issue:** `getFieldContent` for list-based fields (DULFS) returns an empty string or formatted text, not the structured data. Consequently, exporting a story currently **loses all character, location, faction, and system data**, as well as the entire Brainstorm chat history.
**Refactor:** Export the entire `StoryData` object from `StoryDataManager` instead of trying to rebuild it field-by-field from the UI layer.

### 2. Async Race Condition in Lorebook UI
**Location:** `StoryEngineUI.createLorebookPanel`
**Finding:** The logic `api.v1.lorebook.entry(entryId).then(...)` is located directly inside the rendering function.
**Issue:** Every time the Lorebook UI re-renders (which can be frequent), it triggers a new asynchronous fetch. This can lead to race conditions where older requests resolve after newer ones, or simply cause unnecessary API pressure.
**Refactor:** Move the entry fetching and session initialization logic into the `onLorebookEntrySelected` hook or a dedicated controller method that only runs once per selection.

---

## MEDIUM Priority

### 1. Redundant Sync Logic
**Location:** `LorebookSyncService.syncAttgToMemory` and `syncStyleToAN`
**Finding:** These two methods are 90% identical, differing only in the regex used and the NAI API called (`api.v1.memory` vs `api.v1.an`).
**Refactor:** Create a private helper `syncToHeader(content, regex, getter, setter)` to handle the unshifting/replacing logic.

### 2. `RenderContext` Bloat
**Location:** `src/ui/field-strategies.ts`
**Finding:** `RenderContext` contains a large number of optional methods (`getItemEditMode`, `runListGeneration`, `setAttgEnabled`, etc.).
**Issue:** This is a "God Object" anti-pattern for the strategy pattern. It makes it hard to see which strategy actually requires which data.
**Refactor:** Split `RenderContext` into more specific interfaces or use a more decoupled event-bus/action approach for UI interactions.

### 3. Inconsistent Prompt Spacing (`fixSpacing`)
**Location:** `src/core/context-strategies.ts`
**Finding:** While `fixSpacing` is used on most blocks, it is missing from `userInstruction` and `exampleFormat` in `buildDulfsContext`.
**Issue:** While these are usually short, GLM-4.6's sensitivity to newlines means consistency is key to avoiding merged instruction blocks.
**Refactor:** Move `fixSpacing` into a central prompt-assembly utility or the `hyper-generator` itself to ensure uniform application.

---

## LOW Priority

### 1. Stateless Strategy Instantiation
**Location:** `src/ui/field-strategies.ts` -> `getFieldStrategy`
**Finding:** Returns `new ListFieldStrategy()` or `new TextFieldStrategy()` on every call.
**Issue:** These classes are stateless. Instantiating them repeatedly is slightly inefficient (though negligible in JS) and adds GC pressure.
**Refactor:** Use singletons or just export the instances.

### 2. Redundant UI Object Re-creations
**Location:** `StoryEngineUI.updateUI` and `BrainstormUI.updateUI`
**Finding:** The entire `sidebar` or `sidebarPanel` object is re-assigned by calling `createSidebar()`.
**Issue:** While NAI's `api.v1.ui.update` requires the panel object, the internal state of `StructuredEditor` and `BrainstormUI` should ideally be more stable.
**Refactor:** Ensure `createSidebar` is as lightweight as possible, or consider if the NAI API allows updating just the `content` property of an existing panel reference.

---

## Refactoring Roadmap (Updated)

1.  **Phase 1 (Data Integrity)**: Fix `exportStoryData` to include the full `StoryData` blob and brainstorm history.
2.  **Phase 2 (Lifecycle)**: Move async entry loading out of the render loop in `StoryEngineUI`.
3.  **Phase 3 (DRY)**: Refactor `LorebookSyncService` and `ContextStrategies` to remove duplicated logic and fix spacing consistency.
4.  **Phase 4 (Type Safety)**: Address the remaining `any` casts in `StoryDataManager.createDefaultData`.