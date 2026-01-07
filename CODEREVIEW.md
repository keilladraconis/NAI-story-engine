# Code Review - Story Engine

## Summary
The Story Engine codebase has been significantly improved by consolidating storage logic into a single source of truth (`StoryManager`) and moving field-specific instructions into configurations. Architectural risks regarding race conditions in storage have been mitigated through debounced saving and explicit initialization sync.

---

## [MEDIUM] Architectural & Structural Issues

### 1. Brittle Fuzzy Matching in `ReviewPatcher`
**Location:** `src/core/review-patcher.ts`
`buildFuzzyPattern` uses the first 5 words of a locator to create a regex.
**Risk:** In repetitive prose, this may match the wrong paragraph. If the AI provides a locator that exists multiple times, only the first one is patched.
**Recommendation:** Consider using more robust anchors or providing the AI with line numbers/indices if possible, although the current "locator" approach is more resilient to minor edits.

### 2. UI Inconsistency in Wand Controls
**Location:** `src/ui/field-strategies.ts`, `src/ui/story-engine-ui.ts`
The Lorebook panel provides "Save" and "Discard" buttons for Wand sessions, but the "Inline Wand" fields (like World Snapshot) do not. Users must use the global "Save" button in the sidebar to commit changes, which is not intuitive for field-specific generation.

---

## [LOW] Style, Dead Code & Refinement

### 1. Casting to `any`
**Location:** `src/core/story-data-manager.ts`, `src/core/story-manager.ts`
While type-safe getters (`getStoryField`, `getDulfsList`) have been added, dynamic access for adding/removing items by ID still relies on `any` casts.
**Recommendation:** Continue refining the `StoryData` interface or using mapped types to further reduce remaining `any` usage.

---

## Refactoring Suggestions
- **DULFS Parsing:** `AgentWorkflowService.parseListLine` uses regexes that could be centralized or simplified.
