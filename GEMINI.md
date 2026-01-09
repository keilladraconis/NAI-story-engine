# Project Overview

This project, "Story Engine," is a structured, field-based worldbuilding system for the NovelAI story-writing platform. It is a TypeScript project that integrates with the NovelAI UI as a sidebar.

The system's goal is to bridge the gap between unstructured brainstorming and structured worldbuilding. It provides a systematic, data-driven workflow with integrated AI assistance to help writers develop rich narrative universes.

Key features include:
- **Structured Field-Based Workflow**: An 8-stage process (Story Prompt, Brainstorm, Synopsis, DULFS, etc.) that guides the writer from an initial idea to a fully developed world.
- **Direct AI Generation**: Integrated single-stage "Generator" for AI-powered content creation within each field, with real-time streaming directly into the field content.
- **Data-Driven Architecture**: A hierarchical data structure (`StoryData`) managed by a central `StoryManager` (`src/core/story-manager.ts`).
- **Collapsible & Toggleable UI**: The user interface is built with data-driven collapsible sections. Fields feature a toggleable view, allowing users to switch between a clean Markdown reading mode and an editing mode.
- **Streamlined Generation UI**: A responsive generation button integrated into field headers that handles state (running, budget, cancellation) and provides immediate feedback.

# Building and Running

This is a NovelAI Script BuildSystem project.

## Building the project

To build the project, run the following command in the root directory:

```bash
nibs build
```

This will compile the TypeScript code and register the Story Engine sidebar in NovelAI.

## Running the project

The project runs within the NovelAI platform. After building the project, the "Story Engine" sidebar will be available in the NovelAI UI.

# Development Conventions

NEVER attempt to create git commits.

## Planning and Coordination

A `PLAN.md` file is present, and it maintains an outline and implementation guide for the project. It should be updated frequently as development proceeds, and when the trajectory differs, update the file to match the latest development trajectory.

## Code Review

Any current architecture or tech debt concerns are noted in the `CODEREVIEW.md` file.

You may periodically read the codebase and give an honest review of the overall architecture, structure, patterns and practices. Identify any dead code that can be deleted, or even unused files. Look for antipatterns and code smells. Look for wonky or inconsistent style. Find similar subroutines and note whether they can be refactored. Summarize your findings as HIGH, MEDIUM, LOW and write them to a `CODEREVIEW.md` file. If you identify any other things which could be helpful to your understanding as a coding LLM, update your `GEMINI.md` file.   

## Documentation
**CRITICAL**: After completing any code modification or task, you MUST update relevant documentation, including `GEMINI.md`, `CODEREVIEW.md`, and `PLAN.md`, to reflect the current state of the project and any architectural changes.

## API

This script is hosted in the browser in a web worker, and only has access to native Javascript APIs offered by quickjs, and the NovelAI Scripting API: `external/script-types.d.ts`. You should consult this file often to confirm API interfaces.

**Crucial Environment Note**: Typical DOM/Node APIs like `setTimeout`, `clearTimeout`, and `setInterval` are **unavailable**. Use the `api.v1.timers` namespace instead. Note that in this environment, `setTimeout` and `clearTimeout` are **asynchronous** and return Promises.

## Coding Style

The project follows standard TypeScript and Prettier conventions. The code is well-structured and uses modern TypeScript features.

- **External Libraries**: Files in the `lib/` directory are considered external dependencies and MUST NOT be modified. If changes are needed, implement them in the `src/` directory by wrapping or extending the library functionality.
- **UI Components**: Reusable UI logic is extracted into `src/ui/ui-components.ts`.
- **Configuration**: Field definitions are centralized in `src/config/field-definitions.ts`.

## Testing Practices

There are no automated tests in the project. Testing is done manually by running the script within the NovelAI platform.

**CRITICAL**: You MUST always verify that the project compiles successfully by running `nibs build` before concluding any task that involves code modifications.

**CRITICAL**: If the user has made specific changes or deletions to the codebase, do NOT revert or undo them unless explicitly asked. Respect the user's modifications as intentional. This is a hard rule: NEVER casually undo a user's edit.

When debugging issues, you may add debugging log statements and provide the user with a test plan. The user can then supply the log output in response after executing the test plan.

### Gemini Added Memories
- The Brainstorm feature has been refactored from a card-based UI to a chat-based message stream interface and moved to its own sidebar tab.
- The codebase uses a `FieldID` enum and a strategy pattern for rendering (`FieldRenderStrategy`).
- Multi-stage generation (Review/Refine) has been removed in favor of a simpler, more reliable direct-to-field generation model.
- `StoryManager` is the single source of truth for all data, utilizing `StoryDataManager` for persistence and `LorebookSyncService` for NAI integration.
- The system supports "Inline Wand" generation for text fields and specialized list generation for DULFS categories.
- A custom Lorebook Panel integration allows for AI-assisted editing of individual lorebook entries managed by Story Engine.
- **DULFS Lorebook Sync**: List items now support name editing which automatically triggers a debounced (2s) re-sync to the NovelAI Lorebook, updating both individual entries (display names and keys) and the full list summary.
- **Enablement Propagation**: Enabling or disabling a DULFS field in the sidebar now correctly propagates that status to the corresponding NovelAI Lorebook categories and entries.
- **Standardized Toggle Behavior**: `toggleableContent` now consistently uses a Pencil icon for Edit and a Disk icon for Save/Preview. Text fields implement a draft system where changes are stored locally and only committed to `StoryManager` (and side effects triggered) upon clicking Save. Generation automatically saves drafts before running.
- **Agent Workflow Subscription**: `AgentWorkflowService` now supports a global subscription mechanism, notifying listeners of all state changes (queued, running, budget wait, completion, error) across all fields.
- **S.E.G.A. Refactoring (Jan 2026)**: `SegaService` has been refactored from a master queue into an orchestrator. It now delegates all queuing and execution to `AgentWorkflowService`, utilizing its subscription model to maintain UI synchronization. This removes redundant queuing logic and improves reliability.
- **Context Optimization (Jan 2026)**: Refined context construction for `ContextStrategyFactory`. `World Snapshot` and `DULFS` summaries are now systematically included in downstream generations (`generate:lorebook`, `generate:attg`, `generate:style`) to improve coherence and maximize token caching efficiency. The context order is strictly: `System` -> `Story Prompt` -> `World Snapshot` -> `DULFS/Volatile` -> `Task`.
- **Streaming Optimization (Jan 2026)**: Updated `StoryManager` (`setFieldContent`, `updateDulfsItem`, `saveFieldDraft`) to use a strict `PersistenceMode` (`"immediate" | "debounce" | "none"`). This replaces ambiguous boolean flags and prevents excessive "Auto-saved global story data" logging during streaming generation by using the `"none"` mode for intermediate chunks. Persistence is now explicitly triggered as `"immediate"` at generation completion.
- **Live Budget Timer (Jan 9, 2026)**: Implemented a live countdown timer for the "Budget Wait" state. The UI now displays "Waiting... Xs" instead of a static message. This utilizes a recursive `api.v1.timers.setTimeout` loop in `AgentWorkflowService` to track remaining time and update the UI every second. `FieldSession` and `listGenerationState` now track `budgetWaitEndTime` and `budgetTimeRemaining`.
- **S.E.G.A. Simplification (Jan 9, 2026)**: Reverted the complex interleaving and phase-based queuing strategy in `SegaService`. The system now uses a straightforward "queue all blank items" approach and dynamically adds discovered lorebooks to the queue without complex phase transitions.
- **Robust Cancellation (Jan 9, 2026)**: Updated `SegaModal` to use `try...finally` for strict cleanup of callbacks and service cancellation on close. Fixed a critical bug in `AgentWorkflowService` where cancelling during a "Budget Wait" state would hang the process; now explicitly calls `budgetResolver()` on cancellation to unblock execution.

## Architectural Overhaul (Jan 2026)
- **Simplified Workflow**: Removed `WandUI`, `ReviewPatcher`, and `StageHandlers`. The system now focuses on high-quality single-pass generation.
- **Strategy Pattern**: UI rendering is decoupled via `ListFieldStrategy` and `TextFieldStrategy`.
- **Context Management**: Prompt building is centralized in `ContextStrategyFactory`, using `hyper-generator` for long-form output.
- **Data-Driven UI**: `FIELD_CONFIGS` drives the generation of the `StructuredEditor` interface.
    - **Current Status (Jan 9, 2026)**: Code review completed. 
    - **Stability**: High.
    - **Maintenance**: Minor type safety and deduplication opportunities noted in `CODEREVIEW.md`.
    - **Refactoring**: Architecture is clean and decoupled.
