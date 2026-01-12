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

### ✅ **Phase 2: Simplified Agent Integration - COMPLETE**

**Status**: The simplified, single-stage generation workflow is fully implemented.
**Refinement (Jan 2026)**: Decisions were made to cut the "Review" and "Refine" stages to focus on a more direct and reliable generation experience.

#### Features Implemented:

- **Simplified Generate Interface**: Replaced the multi-stage control cluster with a direct **responsive generate button** in the field header.
- **Direct-to-Field Generation**: Content now streams directly into the field's draft state, with live updates to the UI and immediate persistence.
- **Budget-Aware Generation**: Integrated budget warning and refill handling directly into the generate button.
- **Lorebook Synchronization**: Generation in the Lorebook panel now automatically syncs with the NovelAI Lorebook on each update.
- **Live Editing**:
  - **World Snapshot**: Text input is directly bound to `StoryManager` with auto-save.
- **Unified Text Fields**: All text-based fields (Story Prompt, World Snapshot, ATTG, Style Guidelines) use the same simplified generation logic.
- **Context Strategies**: Specialized prompt engineering for "Brainstorm" (Ideator), "World Snapshot" (Architect), and other specific fields.
- **Cleanup (Jan 8 2026)**:
  - **Removed Stages**: Deleted "Review" and "Refine" stages and associated logic (`ReviewPatcher`, `StageHandler`).
  - **Removed Generation UI Cluster**: Deleted `WandUI` and its inline control cluster in favor of header-integrated buttons.
  - **Simplified Sessions**: `FieldSession` now only tracks general generation state (running, cancellation, budget).

### 🔄 **Phase 3: Deep Worldbuilding (DULFS) - COMPLETE**

**Status**: Completed Jan 8, 2026
**Goal**: Implement structured list-based fields for Dramatis Personae, Universe Systems, Locations, Factions, and Situational Dynamics.

#### Completed Features:

- [x] **Data Structure**: Update `StoryData` to support array-based fields (Lists of Objects).
- [x] **UI Component**: Create a `ListEditor` component (implemented via `ListFieldStrategy`) for adding, removing, and reordering items.
- [x] **Field Integration**: Update `FieldDefinitions` to support a `layout: "list"` configuration.
- [x] **Generation**: Specialized prompt strategies and streaming list generation.
- [x] **Lorebook Integration**: Linking DULFS items to NovelAI Lorebook entries with bi-directional syncing.
- [x] **Lorebook Panel**: Custom AI-assisted editing panel that appears when selecting linked entries in the NovelAI Lorebook.

_(Note: "Content Extraction" is currently handled via generative context strategies rather than extraction from existing story text.)_

### 📋 **Phase 4: Advanced Features & Polish - COMPLETE**

**Status**: Active / Post-MVP
**Priority**: MEDIUM

#### Completed Features (Phase 4):

- [x] **Generation Queue**: Implemented a global queue to prevent concurrent generation requests, ensuring sequential execution and reducing UI chaos. Users can cancel queued items.
- [x] **Context Optimization**: Re-engineered `ContextStrategyFactory` to maximize token caching efficiency. Context is now layered strictly: `System` -> `Story Prompt` -> `World Snapshot` -> `Volatile Data` -> `Task`. DULFS and World Snapshot are now injected into downstream generations (Lorebook, ATTG, Style).
- [x] **Robust Cancellation**: Updated `SegaModal` and `AgentWorkflowService` to ensure reliable cancellation and cleanup, even during budget wait states.
- [x] **Background S.E.G.A.**: Refactored S.E.G.A. from a modal to a background service that randomly selects and generates blank fields while the user works.

### **Phase 5: Bug Bashing and Refinement**

- [x] **Editable Brainstorm Chat - COMPLETE**: As a user, I may be conversing with brainstorm when I want to influence slightly what they say, correcting a misspoken word or phrase. I should be able to "retry" a message, delete it, or edit it.
- **Incorporate existing story context into Story Prompt, DWS, etc**: As a user, I have an existing story which I want to bootstrap into Story Engine, so if I generate a Story Prompt it should write based on the current content of the story, if one is present.
- [x] **Brainstorm Agent Personality Refinement - COMPLETE**: As a user, I find brainstorm's response-query pattern un-fun to interact with. I want brainstorm to have a more casual conversation with me, while still helping me follow the Core Principles.
- [x] **SEGA Background - COMPLETE**: As a user, I want to be able to turn on "S.E.G.A." And let it automatically, randomly, iterate through the ungenerated items and generate them in the background while I write the first couple chapters of my story.
- [x] **Incorporate Brainstorm as most-recent context for Field, Lorebook generation**: As a user, I want to be able to use brainstorm to discuss specifics about a character or group of characters, and have that discussion incorporated into my generations.

### ✅ **Phase 6: Quality Assurance & Testing - COMPLETE**

**Status**: Unit testing for core logic is established.
**Goal**: Ensure reliability of data management, parsing, and debouncing logic.

#### Features Implemented:

- **Vitest Integration**: Set up Vitest as the testing framework for the project.
- **Mock Scripting Environment**: Created a comprehensive setup to stub the NovelAI Scripting API (`api.v1.*`), allowing tests to run in a standard Node.js environment.
- **Core Unit Tests**:
  - `ContentParsingService`: Verified parsing of list items and Dramatis Personae.
  - `BrainstormDataManager`: Verified message management and consolidation.
  - `Debouncer`: Verified asynchronous debouncing and cancellation logic.
  - `StoryDataManager`: Verified default data creation, field access, and persistence triggering.
- **Test Automation**: Added `npm run test` script for easy verification of core logic changes.

### **Phase 7: Further usability improvements**

The goal of this phase is to address outstanding nit-picks and sub-optimal UX and bugs related to the existing UI components and systems.

#### Features

- [x] Brainstorm UI shows queueing/waiting status of brainstorm chat.
- [x] Optional binding of Story Prompt and/or World Snapshot to lorebooks.
- [x] Fast S.E.G.A. mode. After brainstorming, if user activates SEGA while Story Prompt, ATTG and Style Guidelines are empty and unbound, open a modal confirmation to "Bootstrap Story from Brainstorm? (Generate Story Prompt, ATTG, Style Guidelines and bind to lorebook, Memory, AN)
- [x] Evaluate factoring Queued Generation / Waiting from `agent-workflow.ts` as a stand-alone library or companion to `HyperGenerate`.
- [x] Attempt to unify `FieldGenerationService` with `ListGenerationService`, the latter is just a consecutive execution of the former. Change "Generate/Add", to "Generate Batch" and "Generate One"
- [x] Clean up ULFS lorebook templates. Allow for non-original settings.
- [x] Allow inclusion of story context into brainstorm, other fields.

### **Phase 8: Scenario Modality**

The goal of this phase is to expand the viability of Story Engine to accommodate different "flavors" or "templates" of scenario. The default follows the "Three Sphere, Three Layer" world-building structure. However, this is not as well-suited to narrower-scope stories, fanfiction, episodes and vignettes, other casual kinds of scenarios. Speculative right now, design forthcoming...

## Feature Requests

[x] indicates votes

- [0] Custom DULFS categories. What if user wants to have "Spaceships" as a category, or "Laws"?

## Bugs

[x] indicates votes

- [3] Apparently after generating multiple lorebooks, lorebook generation goes haywire. Observed in "Universe Systems". Maybe rolling context window is too big? Correction: might have been `violet` being insane.
- [2] DULFS looping/insanity while generating. Also might be from `violet`.
- [ ] After discussing additional characters in brainstorm, DP generate doesn't add more characters.

## 🏗️ Technical Implementation Details

### Refactoring & Code Quality

- **Modular UI**: Extracted reusable components (`createHeaderWithToggle`, `createToggleableContent`) to `src/ui/ui-components.ts`.
- **Single Source of Truth**: Removed direct `storageKey` binding in UI components to ensure `StoryManager` is the sole entity managing persistence, preventing desync between global data and individual field keys.
- **Simplified Workflow**: Removed `WandUI`, `ReviewPatcher`, and `StageHandlers` to focus on a direct-to-field generation model.
- **Configuration**: Centralized field definitions in `src/config/field-definitions.ts`.
- **Cleanup**: Removed unused variables and dead code in `AgentWorkflowService` and `ContextStrategies`.
- **Fixes**: Resolved double-spacing issues in generation by replacing `hyperContextBuilder` with a local implementation.
- **AgentWorkflow Refactor (Jan 2026)**: Split `AgentWorkflowService` into a facade coordinating `FieldGenerationService` and `ListGenerationService`, simplifying the core workflow logic and separating concerns.

### Core Components

- **`story-manager.ts`**: Central data management.
- **`structured-editor.ts`**: Main editor UI orchestrator.
- **`agent-workflow.ts`**: Simplified generation logic and session management.
- **`hyper-generator.ts`**: NovelAI generation API wrapper.
- **`sega-service.ts`**: Background orchestration for S.E.G.A.

## 📅 Development Timeline

### Sprint 1 (Completed) - Core Architecture

- ✅ Data structures, Storage, Basic UI.

### Sprint 2 (Completed) - Agent Integration & UX Simplification

- ✅ Single-stage generation workflow.
- ✅ Header-integrated responsive generate button.
- ✅ Context Strategy Factory.
- ✅ UI Refactoring and Modularization.
- ✅ Removal of complex Review/Refine cycles.

### Sprint 3 (Completed) - DULFS & Lorebooks

- ✅ **DULFS UI**: List management interface.
- ✅ **Lorebook API**: Integration with NovelAI's lorebook system.
- ✅ **Lorebook Panel**: dedicated generation UI for entries.

### Sprint 4 (Completed) - S.E.G.A. Background Service

- ✅ **Background Service**: Refactored S.E.G.A. to run as a non-intrusive background process.
- ✅ **UI Toggle**: Replaced modal with a simple toggle button in the sidebar header.

## 📋 Manual Testing & Quality Assurance

All verification is performed manually within the NovelAI platform.

- **Build Verification**: `nibs build` passes cleanly.
- **UI Verification**: Manual check of toggle buttons, Generate workflow, and field persistence.

## 🚀 Risk Mitigation

- **Storage**: Defensive coding for data persistence.
- **Performance**: Monitor rendering of large lists (DULFS).
- **UX**: Ensure DULFS list management remains intuitive.
