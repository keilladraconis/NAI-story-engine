# Story Engine

**Story Engine** is a comprehensive, structured worldbuilding system designed specifically for **NovelAI**. It transforms the blank page into a rich, interconnected narrative universe using a systematic, data-driven workflow.

> **Bridge the gap between unstructured brainstorming and a fully realized story bible.**

## 🚀 Key Features

### 🧠 Structured Workflow
Move logically from a spark of an idea to a complete world bible. The 8-stage pipeline guides you through:
- **Story Prompt**: Define your core themes and protagonist.
- **Brainstorming Chat**: A dedicated sidebar tab to converse with the AI and iterate on ideas.
- **World Snapshot**: A high-level overview of your setting's state and tensions.
- **DULFS**: **D**ramatis Personae **U**niverse Systems **L**ocations **F**actions **S**ituational Dynamics for granular detailing.

### 🌌 S.E.G.A. (Story Engine Generate All)
The **S.E.G.A.** orchestrator is your "one-click" worldbuilder. It intelligently queues and generates content for every empty field in your project, respecting dependencies and context. Watch your world populate in real-time!

### 📚 DULFS & Lorebook Sync
**DULFS** (Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics) are more than just text.
- **Auto-Sync**: Every entry you generate in a DULFS list is **automatically synced to your NovelAI Lorebook**.
- **Live Updates**: Edit a character's name in the Story Engine list, and it updates the Lorebook entry and keys instantly.
- **Smart Context**: These lists feed back into the AI's context for future generations, ensuring consistency.

### ⚡ Integrated & Inline
- **Direct-to-Field Generation**: No copy-pasting. AI writes directly into your fields.
- **Live Editing**: Switch any field to "Edit Mode" to tweak text manually, then switch back to "Read Mode" for a clean Markdown view.
- **Smart Context Injection**: The engine constructs prompts by layering your data (System -> Prompt -> Snapshot -> DULFS), so the AI always knows the current state of your world.

## 🛠️ Installation

This project is a **NovelAI Script**.

1.  **Build the Project**:
    ```bash
    nibs build
    ```
2.  **Install in NovelAI**:
    -   Locate the output file: `dist/NAI-story-engine.naiscript`.
    -   Open the **NovelAI Script Editor** (in the sidebar).
    -   Create a new script and paste the contents of the file, or import it directly.
3.  **Activate**:
    -   Enable the script in the dashboard. The **Story Engine** sidebar will appear on the right.

## 📖 Usage Guide

1.  **Start with a Spark**: Go to the **Brainstorm** tab and chat with the AI about your idea.
2.  **Define the Prompt**: Use the **Story Prompt** field to solidify the core concept.
3.  **Snapshot the World**: Generate a **World Snapshot** to establish the setting's mood and major tensions.
4.  **Run S.E.G.A.** Click the "Generate All" button to have the AI populate your Factions, Characters, Locations, and Systems automatically.
5.  **Refine**: Edit any entry manually. Your changes are instantly reflected in the Lorebook.

## 🏗️ Project Structure

-   `src/core/`: The brain of the engine. Handles `StoryManager`, `AgentWorkflow`, and `LorebookSync`.
-   `src/ui/`: All visual components, including the `StructuredEditor` and `SegaModal`.
-   `src/config/`: Configuration files, primarily `field-definitions.ts`.
-   `src/lib/`: External utilities and the `hyper-generator`.

## 🤝 Contributing

Contributions are welcome! Please review `GEMINI.md` and `PLAN.md` to understand the architectural decisions and current roadmap before submitting a PR.