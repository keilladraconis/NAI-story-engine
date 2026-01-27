# Story Engine - Project Knowledge Base

## Project Overview

**Story Engine** is a comprehensive worldbuilding system integrated into NovelAI. It transitions from a simple multi-agent chat to a structured, field-based creative suite. It bridges the gap between creative exploration (Brainstorming) and structured organization (DULFS, Lorebooks) for writers.

## Core Architecture

### Data & State Management

- **Single Source of Truth**: `StoryManager` is the central hub for all state. It manages persistence, debouncing, and parsing.
- **Pub/Sub Pattern**: Adheres to "Action Flows Up, Reaction Flows Down". Components subscribe to `StoryManager` or specific services (`SegaService`, `UnifiedGenerationService`) via the `Subscribable` class. Callbacks are deprecated.
- **Data Structure**: `StoryData` contains all fields, DULFS lists, and workflow states.

### UI Architecture

- **Strategy Pattern**: `StructuredEditor` delegates rendering to `FieldRenderStrategy` implementations (e.g., `TextFieldStrategy`, `ListFieldStrategy`, `InlineWandStrategy`).
- **Configuration Driven**: UI layout and behavior are defined in `src/config/field-definitions.ts`. `FieldID` enums are used strictly over magic strings.
- **Brainstorm UI**: A specialized chat-based message stream interface, now integrated into the main workflow.

### Generation Pipeline

- **Unified Service**: `UnifiedGenerationService` handles Field, List, and Brainstorm generation, unifying logic that was previously split.
- **GenX Queue**: `lib/generation-queue.ts` provides a generic serial execution queue (`GenX`) and budget management (`BudgetTimer`), decoupling infrastructure from business logic.
- **Context Injection**: Context is layered: `System` -> `Setting` -> `Story Prompt` -> `World Snapshot` -> `Volatile Data`.

## Key Features

### S.E.G.A. (Story Engine Generate All)

- **Background Service**: Runs unobtrusively to fill blank fields.
- **Round-Robin Queueing**: Interleaves generation requests across categories (e.g., one Character, then one Location) rather than strictly sequential lists.
- **Fast Mode**: Bootstraps new stories by auto-generating Story Prompt, ATTG, and Style Guidelines from a Brainstorm session if they are empty.

### DULFS (Deep Universal Lorebook Field System)

- **Two-Phase Generation**:
  1.  **Phase 1 (List)**: Generates a list of names/subjects.
  2.  **Phase 2 (Content)**: Generates detailed content for specific items (User triggered or SEGA).
- **Lorebook Sync**: Bi-directional syncing between DULFS items and NovelAI Lorebook entries. Manual edits in NAI Lorebook are protected.
- **Category Summaries**: High-level digests of lists stored in `StoryData.dulfsSummaries`.

### Brainstorm Integration

- **Workflow Participant**: The "Send" button participates in the global generation queue.
- **Context Aware**: Brainstorm history is used as context for World Snapshot and other field generations.
- **Editable History**: Users can edit, delete, or retry messages in the chat stream.

### Global Setting

- **Setting Field**: A global configuration field injected into all generation contexts to ensure thematic consistency across the story bible.

## Technical Conventions

- **Enums**: Use `FieldID` for all field references.
- **No Magic Strings**: Regex patterns and prompts belong in `FIELD_CONFIGS` or configuration files.
- **Type Safety**: Strictly typed interfaces for `StoryData` and `StoryManager`. Avoid `any`.
- **Testing**: Vitest for core logic (Parsing, Debouncing, Data Managers).

## Coding Guidelines

- **Strict Typing & APIs**:
  - Read `.d.ts` files (e.g., `external/script-types.d.ts`) to adhere strictly to API signatures.
  - Avoid `any` casts completely, especially with API interactions (e.g., never `api as any`).
  - Rely on `api.v1.hooks` instead of the deprecated `api.v1.events`.
  - Use API utilities like `api.v1.uuid()` instead of random ID generation.
- **API Trust**: Trust provided `.d.ts` files implicitly. Do not wrap API calls in defensive existence checks or try-catch blocks unless handling a documented optional feature.
- **Logging**: Use `api.v1.log` for all logging. `console.log` is not supported.
- **Architecture**:
  - **No Singletons/Globals**: Prefer dependency injection in `src/index.ts`.
- **Project Management**:
  - **Tool Usage**: Prefer using tools (like `read_file`, `glob`) over shell commands wherever possible.
  - **Task Tracking**: Proactively check off and update tasks in `PLAN.md` as they are completed.

## Development Workflow

### Plan

Write a `PLAN.md` to lay out and prepare for larger development efforts. Include a list of tasks and update regularly as progress is made.

### Build

Generates the `.naiscript` bundle in the `dist/` directory.

```bash
npm run build
```

### Test

Executes the Vitest suite for core logic verification.

```bash
npm run test
```

### Format

Applies Prettier formatting to the codebase.

```bash
npm run format
```

## Gemini Added Memories
