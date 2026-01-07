# Project Overview

This project, "Story Engine," is a structured, field-based worldbuilding system for the NovelAI story-writing platform. It is a TypeScript project that integrates with the NovelAI UI as a sidebar.

The system's goal is to bridge the gap between unstructured brainstorming and structured worldbuilding. It provides a systematic, data-driven workflow with integrated AI assistance to help writers develop rich narrative universes.

Key features include:
- **Structured Field-Based Workflow**: An 8-stage process (Story Prompt, Brainstorm, Synopsis, DULFS, etc.) that guides the writer from an initial idea to a fully developed world.
- **Integrated Agentic Assistance**: A three-stage "agentic cycle" (Generate, Edit/Correct, Rewrite/Refine) for AI-powered content creation and refinement within each field.
- **Data-Driven Architecture**: A hierarchical data structure (`StoryData`) managed by a central `StoryManager` (`src/core/story-manager.ts`).
- **Complete Versioning**: Every field's content has a full history, managed by `FieldHistoryManager` (`src/core/field-history.ts`), allowing for tracking changes and reverting to previous versions.
- **Collapsible & Toggleable UI**: The user interface is built with data-driven collapsible sections. Fields feature a toggleable view, allowing users to switch between a clean Markdown reading mode and an editing mode.
- **Refined Wand UI**: The AI generation ("Wand") interface offers a streamlined experience with stage selection, preview/edit toggles for generated content, and clear action states.

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

## Planning and Coordination

A `PLAN.md` file is present, and it maintains an outline and implementation guide for the project. It should be updated frequently as development proceeds, and when the trajectory differs, update the file to match the latest development trajectory.

## API

This script is hosted in the browser in a web worker, and only has access to native Javascript APIs offered by quickjs, and the NovelAI Scripting API: `external/script-types.d.ts`. You should consult this file often to confirm API interfaces.

## Coding Style

The project follows standard TypeScript and Prettier conventions. The code is well-structured and uses modern TypeScript features.

- **UI Components**: Reusable UI logic is extracted into `src/ui/ui-components.ts` and specialized classes like `WandUI` (`src/ui/wand-ui.ts`).
- **Configuration**: Field definitions are centralized in `src/config/field-definitions.ts`.

## Testing Practices

There are no automated tests in the project. Testing is done manually by running the script within the NovelAI platform.

When debugging issues, you may add debugging log statements and provide the user with a test plan. The user can then supply the log output in response after executing the test plan.

## Architectural Insights

### Data Flow & State Management
- **Single Source of Truth**: `StoryManager` acts as the central hub for story data, but `StructuredEditor` also interacts directly with `storyStorage` via `kse-field-${id}` keys.
- **Agent Cycle**: Managed by `AgentCycleManager` and executed by `AgentWorkflowService`. It uses a strategy pattern (`StageHandler`) to handle the Generate, Review, and Refine stages.
- **Lorebook Integration**: DULFS (Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics) are automatically synced to NovelAI Lorebook categories and entries.

### Key Patterns
- **Strategy Pattern**: Extensively used for field rendering (`FieldRenderStrategy`) and AI stage handling (`StageHandler`).
- **Context Construction**: `ContextStrategyFactory` builds model-specific prompts based on the current field and session state.
- **Fuzzy Patching**: `ReviewPatcher` uses a 5-word prefix fuzzy matching strategy to apply AI-suggested tags to field drafts.
- **Hyper-Generator**: The project uses `lib/hyper-generator.ts` for advanced generation control, including continuation handling and token budget management.

### Known Oddities
- **Newline Doubling**: Prompt construction doubles all newlines (`fixSpacing`) for backend compatibility.
- **Live Patching**: The Review stage patches the field draft *while* the agent is still generating the critique.
- **Emoji Cursor**: The Refine stage uses `✍️` as a visual indicator of where the model is currently writing.
