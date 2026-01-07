# Code Review - Story Engine

## Summary
The Story Engine codebase demonstrates a solid foundation with clear separation of concerns in some areas (Strategy Pattern for rendering and stage handlers), but suffers from a "God Object" anti-pattern in `StoryManager` and redundant synchronization logic that could lead to data inconsistency.

---

## [HIGH] Architectural & Structural Issues

### 1. `StoryManager` as a God Object
**Location:** `src/core/story-manager.ts`
`StoryManager` is currently responsible for:
- State management of the entire story.
- Migration logic for older data versions.
- Lorebook entry creation, updating, and syncing.
- History management and committing changes.
- Syncing content to NovelAI's Memory and Author's Note.

**Recommendation:** Decompose `StoryManager` into specialized services:
- `StoryDataManager`: Pure state management.
- `MigrationService`: Handles data upgrades.
- `LorebookSyncService`: Manages interaction with the Lorebook API.
- `HistoryService`: Manages `FieldHistory` and versioning.

### 2. Redundant Synchronization & Race Conditions
**Location:** `src/ui/structured-editor.ts`, `src/core/story-manager.ts`
The system attempts to sync from both a global `kse-story-data` key and individual `kse-field-${id}` keys. 
- `StructuredEditor.syncFieldsFromStorage` pulls from individual keys on startup and overwrites `StoryManager` state.
- `multilineTextInput` with `storageKey` auto-saves to individual keys.
- `StoryManager.saveStoryData` saves the whole blob.

**Risk:** If the global blob and individual keys get out of sync (e.g., due to a crash or partial update), the state becomes unpredictable. It also introduces unnecessary `storyStorage.get/set` calls.

**Recommendation:** Decide on a single source of truth in `storyStorage`. If using individual keys for auto-save convenience, `StoryManager` should perhaps be a thin wrapper around these keys rather than maintaining a redundant mirrored object.

---

## [MEDIUM] Code Smells & Antipatterns

### 1. Hardcoded Logic in `ContextStrategies`
**Location:** `src/core/context-strategies.ts`
`buildDulfsContext` contains hardcoded instructions and formatting examples for every DULFS category.
**Recommendation:** Move these instructions/examples into the `FieldConfig` in `src/config/field-definitions.ts`. This makes the strategies truly generic and simplifies adding new categories.

### 2. Brittle Fuzzy Matching in `ReviewPatcher`
**Location:** `src/core/review-patcher.ts`
`buildFuzzyPattern` uses the first 5 words of a locator to create a regex.
**Risk:** In repetitive prose, this may match the wrong paragraph. If the AI provides a locator that exists multiple times, only the first one is patched.
**Recommendation:** Consider using more robust anchors or providing the AI with line numbers/indices if possible, although the current "locator" approach is more resilient to minor edits.

### 3. UI Inconsistency in Wand Controls
**Location:** `src/ui/field-strategies.ts`, `src/ui/story-engine-ui.ts`
The Lorebook panel provides "Save" and "Discard" buttons for Wand sessions, but the "Inline Wand" fields (like World Snapshot) do not. Users must use the global "Save" button in the sidebar to commit changes, which is not intuitive for field-specific generation.

---

## [LOW] Style, Dead Code & Refinement

### 1. Dead Code
- `src/ui/colors.ts`: `NAI_NAVY` is unused. `NAI_YELLOW` is hardcoded elsewhere.
- `src/core/field-history.ts`: `FieldHistoryManager` is an empty class.
- `createFieldActions` in `src/ui/field-strategies.ts` is a no-op placeholder.

### 2. Wonky Style Choices
- **Emoji Cursor:** `RefineStageHandler` inserts a `✍️` emoji into the draft during streaming. While creative, it can interfere with user interaction if they try to edit or copy during generation.
- **Newline Doubling:** `fixSpacing` in `ContextStrategies.ts` doubles all newlines. This is noted as a GLM-4.6 compatibility fix, but should be documented more clearly if it applies to all models or just specific ones.
- **Hardcoded Colors:** Colors from `colors.ts` are hardcoded as strings in `wand-ui.ts` instead of using the exported constants.

### 3. Frequent Casting to `any`
**Location:** `src/core/story-manager.ts`
Extensive use of `(this.currentStory as any)[fieldId]` for dynamic access.
**Recommendation:** Use a proper `Record<FieldID, StoryField | DULFSField[]>` or similar mapping in the `StoryData` interface to improve type safety.

---

## Refactoring Suggestions
- **DULFS Parsing:** `AgentWorkflowService.parseListLine` uses regexes that could be centralized or simplified.
- **Brainstorm Service:** The brainstorm logic is split between `StoryManager` (data) and `BrainstormService` (generation). The data methods in `StoryManager` could be moved to a dedicated service or sub-manager.
