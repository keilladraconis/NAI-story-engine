# Story Engine

Story Engine is a structured, field-based worldbuilding system for the NovelAI story-writing platform. It bridges the gap between unstructured brainstorming and structured worldbuilding by providing a systematic, data-driven workflow with integrated AI assistance.

## Features

-   **Structured Workflow:** Guides you from an initial prompt to a fully realized world through defined fields (Brainstorm, World Snapshot, DULFS, etc.).
-   **AI "Wand":** An integrated agentic cycle (Generate -> Review -> Refine) helps you create and polish content for each field.
-   **Markdown Support:** Read your worldbuilding notes in a clean, rendered Markdown view.
-   **Edit Mode:** Toggle into edit mode to make manual adjustments or corrections.
-   **History Tracking:** Keep track of changes and versions for every field.

## Setup

1.  **Build:** Run `nibs build` to compile the TypeScript project.
2.  **Install:** Copy the output file (`dist/NAI-story-engine.naiscript`) to your NovelAI scripts folder or paste the content into the script editor.
3.  **Run:** Enable the script in NovelAI. The "Story Engine" sidebar will appear.

## Project Structure

-   `src/core/`: Core logic for story management, agent cycles, and context strategies.
-   `src/ui/`: UI components, including the sidebar editor and the Wand interface.
-   `src/config/`: Configuration files (e.g., field definitions).
-   `src/hyper-generator.ts`: Wrapper for the NovelAI generation API.

## Contributing

Contributions are welcome! Please check `GEMINI.md` for more details on the project's architecture and development conventions.
