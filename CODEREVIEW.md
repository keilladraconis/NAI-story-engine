# Code Review - Story Engine

## Summary
The Story Engine codebase demonstrates a solid foundation with clear separation of concerns (Strategy Pattern for rendering and stage handlers). Recent refactoring has decomposed the `StoryManager` god object into specialized services, though some architectural risks regarding redundant synchronization remain.

---

## [HIGH] Architectural & Structural Issues

### 1. Redundant Synchronization & Race Conditions
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
- `src/ui/colors.ts`: `NAI_NAVY` is unused.
- `createFieldActions` in `src/ui/field-strategies.ts` is a no-op placeholder.

### 2. Wonky Style Choices
- **Newline Doubling:** `fixSpacing` in `ContextStrategies.ts` doubles all newlines. This is noted as a GLM-4.6 compatibility fix, but should be documented more clearly if it applies to all models or just specific ones.

### 3. Casting to `any`
**Location:** `src/core/story-data-manager.ts`, `src/core/story-manager.ts`
While type-safe getters (`getStoryField`, `getDulfsList`) have been added, dynamic access for adding/removing items by ID still relies on `any` casts.
**Recommendation:** Continue refining the `StoryData` interface or using mapped types to further reduce remaining `any` usage.

---

## Refactoring Suggestions
- **DULFS Parsing:** `AgentWorkflowService.parseListLine` uses regexes that could be centralized or simplified.