# Story Engine: Project Plan & Status

## 🎯 Project Overview

**Story Engine** is a complete redesign of the original multi-agent chat system into a structured, field-based worldbuilding system with integrated agentic AI assistance. The project aims to create a seamless bridge between creative exploration and structured organization for writers building narrative universes.

## 📋 Current Status

### ✅ **Phase 1: Core Architecture - COMPLETE**
**Status**: Core data management, storage, and UI framework are stable.
**Build**: ✅ Successful compilation with `nibs build`

#### Completed Components:
1. **Data Layer Architecture**
   - `StoryData` structure with workflow stages and DULFS categorization.
   - `StoryManager` CRUD operations for all primary fields.
2. **Storage System**
   - Stable key management and NAI-native state binding.
3. **UI Architecture**
   - `StructuredEditor` with collapsible sections.
   - **Toggleable View**: Fields support Markdown reading mode and Text editing mode.

### ✅ **Phase 2: Advanced Agent Integration - COMPLETE**
**Status**: The three-stage agentic cycle (Wand) is fully implemented and integrated.
**Refinement (Jan 2026)**: Major UX overhaul to remove modality and improve data flow.

#### Features Implemented:
- **The Wand Interface**: Refactored from a modal to an **inline, non-modal control cluster** that sits directly within the field.
- **Three-Stage Cycle**: 
    - **Generate**: Live text streaming into the editor.
    - **Review**: **Streaming Patcher** that inserts critique tags directly into the text using robust fuzzy-prefix matching (supports Markdown & out-of-order tags).
    - **Refine**: Consumes the tagged text to produce a polished final version.
- **Live Editing**: 
    - **World Snapshot**: Text input is now directly bound to `StoryManager` with auto-save, allowing seamless manual edits alongside AI generation.
    - **No-Save UI**: Removed "Save/Discard" buttons in favor of immediate persistence.
- **Field-Specific UX**:
    - **Story Prompt**: Simplified to a clean, plain-text multiline input without toggle complexity.
    - **Wand UI**: Unified stage selector and "Ignite" controls.
- **Context Strategies**: Specialized prompt engineering for "Brainstorm" (Ideator) and "World Snapshot" (Architect).
- **Refactoring**: Decoupled UI logic into `WandUI` and reusable components.
- **Architectural Cleanup (Jan 5 2026)**:
    - **Single Source of Truth**: Removed `session.currentContent` in favor of direct `StoryManager` interaction.
    - **Strategy Patterns**: Implemented `StageHandler` (Generate/Review/Refine) and `FieldRenderStrategy` (Inline/Standard) to eliminate conditional spaghetti code.
    - **Review Patcher**: Extracted fuzzy-prefix patching logic into a dedicated service.
    - **Configuration**: Brainstorm prompts are now fully configurable via `project.yaml`.
    - **Cleanup**: Removed dead code (`ActiveWandStrategy`, `createWorkflowUI`).

### 🔄 **Phase 3: Deep Worldbuilding (DULFS) - PARTIALLY COMPLETE**
**Status**: Active
**Goal**: Implement structured list-based fields for Dramatis Personae, Universe Systems, Locations, Factions, and Situational Dynamics.

#### Planned Features:
- [x] **Data Structure**: Update `StoryData` to support array-based fields (Lists of Objects).
- [x] **UI Component**: Create a `ListEditor` component (implemented via `ListFieldStrategy`) for adding, removing, and reordering items.
- [x] **Field Integration**: Update `FieldDefinitions` to support a `layout: "list"` configuration.
- [x] **Generation**: Specialized prompt strategies and streaming list generation.
- [ ] **Lorebook Integration**: Linking DULFS items to NovelAI Lorebook entries.

### 📋 **Phase 4: Advanced Features & Polish - PLANNED**
**Status**: Post-MVP features
**Priority**: MEDIUM

#### Planned Features:
- Multi-project support
- Template and genre presets
- Export to multiple formats
- CSS styling refinement

## 🏗️ Technical Implementation Details

### Refactoring & Code Quality
- **Modular UI**: Extracted reusable components (`createHeaderWithToggle`, `createToggleableContent`) to `src/ui/ui-components.ts`.
- **Wand UI**: Encapsulated all Wand-related UI logic in `src/ui/wand-ui.ts`.
- **Configuration**: Centralized field definitions in `src/config/field-definitions.ts`.
- **Cleanup**: Removed unused variables and dead code in `AgentWorkflowService` and `ContextStrategies`.

### Core Components
- **`story-manager.ts`**: Central data management.
- **`agent-cycle.ts`**: Agentic processing system state.
- **`structured-editor.ts`**: Main editor UI orchestrator.
- **`wand-ui.ts`**: Specialized UI for the AI generation workflow.
- **`hyper-generator.ts`**: NovelAI generation API wrapper.

## 📅 Development Timeline

### Sprint 1 (Completed) - Core Architecture
- ✅ Data structures, Storage, Basic UI.

### Sprint 2 (Completed) - Agent Integration & UX
- ✅ Wand Modal UI with Markdown/Edit toggles.
- ✅ 3-Stage Agent Logic (Generate -> Review -> Refine).
- ✅ Context Strategy Factory.
- ✅ UI Refactoring and Modularization.

### Sprint 3 (Next) - DULFS & Lorebooks
- 🔄 **DULFS UI**: List management interface.
- 📋 **Lorebook API**: Integration with NovelAI's lorebook system.
- 📋 **Content Extraction**: Logic to condense text into lorebook entries.

## 📋 Manual Testing & Quality Assurance
All verification is performed manually within the NovelAI platform.
- **Build Verification**: `nibs build` passes cleanly.
- **UI Verification**: Manual check of toggle buttons, Wand workflow, and field persistence.

## 🚀 Risk Mitigation
- **Storage**: Defensive coding for data persistence.
- **Performance**: Monitor rendering of large lists (DULFS).
- **UX**: Ensure DULFS list management remains intuitive.
