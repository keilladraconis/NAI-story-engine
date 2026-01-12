# Project Overview

This project, "Story Engine," is a structured, field-based worldbuilding system for the NovelAI story-writing platform. It is a TypeScript project that integrates with the NovelAI UI as a sidebar.

The system's goal is to bridge the gap between unstructured brainstorming and structured worldbuilding. It provides a systematic, data-driven workflow with integrated AI assistance to help writers develop rich narrative universes.

Key features include:

- **Structured Field-Based Workflow**: An 8-stage process (Story Prompt, Brainstorm, Synopsis, DULFS, etc.) that guides the writer from an initial idea to a fully developed world.
- **Direct AI Generation**: Integrated single-stage "Generator" for AI-powered content creation within each field, with real-time streaming directly into the field content.
- **Data-Driven Architecture**: A hierarchical data structure (`StoryData`) managed by a central `StoryManager` (`src/core/story-manager.ts`).
- **Collapsible & Toggleable UI**: The user interface is built with data-driven collapsible sections. Fields feature a toggleable view, allowing users to switch between a clean Markdown reading mode and an editing mode.
- **Streamlined Generation UI**: A responsive generation button integrated into field headers that handles state (running, budget, cancellation) and provides immediate feedback.
- **Automated Testing**: Unit tests for core business logic using Vitest, with a mocked environment for the NovelAI Scripting API.

# Building and Running
...
## Testing Practices

Automated unit tests are located in the `tests/` directory and focus on the `@src/core/**` business logic. UI components are tested manually.

**Test Command**:
```bash
npm run test
```

**CRITICAL**: You MUST always verify that the project compiles successfully by running `npm run build` before concluding any task that involves code modifications. In addition, you should run `npm run test` if you have modified files in `src/core/`.

**CRITICAL**: If the user has made specific changes or deletions to the codebase, do NOT revert or undo them unless explicitly asked. Respect the user's modifications as intentional. This is a hard rule: NEVER casually undo a user's edit.

When debugging issues, you may add debugging log statements and provide the user with a test plan. The user can then supply the log output in response after executing the test plan.

# Development Conventions

**CRITICAL**: Making or preparing git commits is strictly prohibited.

Format all code with the `npm run format` script.

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

# Gemini Added Memories

- Brainstorm personality updated to be casual, subtle, and conversational (Jan 10, 2026). Replaced rigid "always ask questions" constraint with an instructional assistant prefill and reduced `maxTokens` to 200 for better brevity.
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
- **HyperGenerator Refactor (Jan 9, 2026)**: Refactored `hyperGenerateWithRetry` in `lib/hyper-generator.ts` to use a loop-based approach with proper exponential backoff (`2^attempts * 1000` ms), replacing the recursive implementation.
- **Persistence Fix (Jan 9, 2026)**: Fixed a critical bug where generated content was lost on reload because `StoryManager.setFieldContent` skipped saving if the in-memory content (updated during streaming) matched the final content. It now enforces a save when `persistence` is `"immediate"`, regardless of the `changed` flag.

## Architectural Overhaul (Jan 2026)

- **Simplified Workflow**: Removed `WandUI`, `ReviewPatcher`, and `StageHandlers`. The system now focuses on high-quality single-pass generation.
- **Strategy Pattern**: UI rendering is decoupled via `ListFieldStrategy` and `TextFieldStrategy`.
- **Context Management**: Prompt building is centralized in `ContextStrategyFactory`, using `hyper-generator` for long-form output.
- **Data-Driven UI**: `FIELD_CONFIGS` drives the generation of the `StructuredEditor` interface.
- **Dramatis Personae Tuning (Jan 9, 2026)**: Updated `Dramatis Personae` configuration to explicitly request Protagonist/Antagonist and replaced the abstract placeholder format with a concrete example (e.g., "Kael (Male, 34, Smuggler)...") to prevent literal placeholder generation and ensure key characters are included.
- DULFS Tuning (Jan 9, 2026): Applied the "Concrete Example" strategy to all DULFS fields (`Locations`, `Factions`, `Universe Systems`, `Situational Dynamics`) to prevent literal placeholder generation. Tuned `buildDulfsContext` parameters (Temp: 1.1, Presence Penalty: 0.1) to further discourage repetition and improve focus.
- **DULFS Generation Fix (Jan 10, 2026)**: Modified `buildDulfsContext` to include the currently generating list's content in the Assistant's prefill and exclude it from the "EXISTING WORLD ELEMENTS" context block. Also sets `minTokens: 0` when prefilling existing items, allowing the LLM to stop early if it determines the list is complete.
- **AgentWorkflow Refactor (Jan 10, 2026)**: Split `AgentWorkflowService` into a facade coordinating `FieldGenerationService` and `ListGenerationService`. Defined `FieldSession` and `ListSession` in `src/core/generation-types.ts` to unify state tracking interfaces. This reduces complexity in the main workflow service and strictly separates text and list generation logic.

  - **Current Status (Jan 10, 2026)**: Code review completed.
  - **Stability**: High.
  - **Maintenance**: Minor type safety and deduplication opportunities noted in `CODEREVIEW.md`.
  - **Refactoring**: Architecture is clean and decoupled.
