# Story Engine: Redesign Edition

A structured, field-based worldbuilding system designed to prepare for and enhance the NovelAI LLM-based story-writing experience. Story Engine provides intelligent tools for developing rich narrative universes through a systematic workflow with integrated agentic AI assistance.

## 🌟 Overview

Story Engine is a next-generation creative assistant that bridges the gap between unstructured brainstorming and structured worldbuilding. It features a systematic workflow with AI agents that helps writers develop complex narratives, characters, and settings through structured fields and intelligent content generation.

### Vision Statement

To create a seamless loop between creative exploration and structured organization, enabling writers to build rich, interconnected universes that evolve naturally from initial concepts to detailed lorebooks and story-ready content through an intuitive field-based interface.

## ✨ Features

### 🎯 Structured Field-Based Workflow
A systematic process guides you through eight interconnected stages of worldbuilding:
1. **Story Prompt**: The initial spark.
2. **Brainstorm**: Creative exploration.
3. **Dynamic World Snapshot**: A snapshot of the world full of dynamic potential.
4. **DULFS**: A sub-structure of condensed, formatted lists including:
    - **Dramatis Personae**: Characters.
    - **Universe Systems**: Rules and mechanics.
    - **Locations**: Settings.
    - **Factions**: Groups and organizations.
    - **Situational Dynamics**: Active forces and tensions.

### 📚 Lorebook Integration
Unlike other data, Lorebooks are not a field in themselves. The Story Engine uses the NovelAI Scripting API to link DULFS items directly to your story's Lorebook entries, ensuring your worldbuilding is immediately available to the LLM.

### 💾 Persistent & Portable
Your work is automatically saved. Plus, you can export and import your story data, making your projects portable.

### 📖 Version History
A complete history is kept for each field, allowing you to track changes and revert to previous versions of your work.

## 🚀 Getting Started

### Prerequisites
- A NovelAI account.
- The NovelAI Script BuildSystem environment.

### Installation
1.  Navigate to the project directory.
2.  Run the build command:
    ```bash
    nibs build
    ```
3.  The Story Engine will then be available as a sidebar in the NovelAI interface.

## 🎮 Usage Guide

1.  **Begin with a Spark**: Enter your initial idea in the "Story Prompt" field.
2.  **Explore and Expand**: Use the "Brainstorm" section to explore concepts.
3.  **Structure the Narrative**: Develop a "Dynamic World Snapshot" and build out the foundational "DULFS" (Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics).
4.  **Refine the Details**: Flesh out characters, locations, and the rules of your world in their dedicated sections.
5.  **Leverage AI**: Look for the **:wand: (Wand)** button next to any field. This opens the **Agentic Workflow Modal**, where you can trigger a 3-stage generation process:
    - **Generate (The Ideator)**: Creates the initial draft using the Three-Sphere Method (High Creativity).
    - **Validate (The Editor)**: Critiques the content and inserts inline tags for improvement (High Precision).
    - **Rewrite (The Polisher)**: Produces the final, high-quality dynamic world snapshot (Balanced Flow).
    *Each agent utilizes a distinct "Creative Profile" (Temperature, Top K, Min P) tailored to their specific role.*
    *Use the tabs to view each stage, click **Ignite** to generate content, or check **Auto-Advance** to run the full cycle automatically!*

## 🔄 Development Roadmap

### Phase 1: Core Architecture ✅ COMPLETE
The foundational data structures, history management, and the data-driven UI are complete.

### Phase 2: Advanced Agent Integration 🔄 IN PROGRESS
Work is ongoing to implement the specialized `:wand:` interface and the three-stage agentic workflow modal.

### Phase 3: Enhanced Field Linking 📋 PLANNED
Future work includes a cross-referencing system between fields and smart content suggestions.

### Phase 4: Lorebook Ecosystem 📋 PLANNED
Plans are in place for automatic lorebook generation and bidirectional editing.

### Phase 5: Advanced Features 📋 PLANNED
The roadmap includes multi-project support, customizable templates, and UI/UX refinements.

## 🎨 Design Philosophy

-   **Simplicity**: Maintain a simple, clean, and intuitive user experience that can support complex creative workflows.
-   **Progressive Enhancement**: Prioritize core functionality, with visual polish and advanced features added iteratively.
-   **Manual Quality Assurance**: We prioritize manual verification and human-in-the-loop creative evaluation over automated testing, ensuring the engine feels right for writers.

## 🧪 Testing Practices

Testing is performed **manually** by running the script within the NovelAI platform. There are **no automated tests** in the project. We utilize structured **Manual Test Plan Documents** (see `PLAN.md`) to verify:
- Core worldbuilding workflows.
- Agentic `:wand:` generation cycles.
- Storage persistence and data integrity.
- UI responsiveness and accessibility.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

-   **Original inspiration**: OccultSage for the hyper-generator concept
-   **Current development**: Keilla
-   **System design**: NovelAI LLM integration framework
-   **Architecture guidance**: Multi-agent system best practices

## 📞 Support

For questions, suggestions, or bug reports, please open an issue in the project repository or join the NovelAI development community.

---

*Story Engine: Where creativity meets structure, and imagination finds its foundation.*