# Story Engine

**Story Engine** is a comprehensive, structured worldbuilding system designed specifically for **NovelAI**. It transforms the blank page into a rich, interconnected narrative universe using a systematic, data-driven workflow.

> **Bridge the gap between unstructured brainstorming and a fully realized story bible.**

## Alpha Release Notice

This is an **alpha release (v0.4.0)**. Use at your own risk.

- **Install in a new story** — Do not install account-wide or replace existing scripts.
- **No data compatibility guarantees** — Future versions may not be compatible with data saved by this version.
- **No data retention guarantees** — Script data may be lost during updates or due to bugs.

## Key Features

### Structured Workflow

Move logically from a spark of an idea to a complete world bible. The pipeline guides you through:

- **Brainstorming Chat**: A dedicated sidebar tab to converse with the AI and iterate on ideas.
- **Story Prompt**: Define your core themes and protagonist.
- **ATTG & Style**: Author, Title, Tags, Genre and Style Guidelines that sync to Memory and Author's Note.
- **DULFS**: **D**ramatis Personae, **U**niverse Systems, **L**ocations, **F**actions, **S**ituational Dynamics for granular world details.

### S.E.G.A. (Story Engine Generate All)

The **S.E.G.A.** orchestrator is your "one-click" worldbuilder. It intelligently queues and generates content for every empty field in your project, respecting dependencies and using round-robin scheduling across DULFS categories.

### DULFS & Lorebook Sync

DULFS entries are more than just text:

- **Auto-Sync**: Every entry you generate in a DULFS list is automatically synced to your NovelAI Lorebook.
- **Live Updates**: Edit a character's name in the Story Engine list, and the Lorebook entry updates instantly.
- **Smart Context**: These lists feed back into the AI's context for future generations, ensuring consistency.

### Integrated Generation

- **Direct-to-Field Generation**: AI writes directly into your fields — no copy-pasting.
- **Lorebook Panel**: Generate content and keys for any lorebook entry from within the Lorebook view.
- **Smart Context Injection**: The engine constructs prompts by layering your data (System -> Setting -> Story Prompt -> DULFS), so the AI always knows the current state of your world.

## Installation

This project is a **NovelAI Script**.

1. **Download** the latest `.naiscript` file from the [Releases](https://github.com/your-repo/releases) page.

2. **Create a new story** in NovelAI specifically for testing this script.

3. **Install the script**:
   - Open the **Script Editor** in NovelAI (sidebar).
   - Import the `.naiscript` file or paste its contents into a new script.

4. **Activate**:
   - Enable the script. The **Story Engine** and **Brainstorm** sidebar panels will appear.

## Usage Guide

1. **Start with a Spark**: Go to the **Brainstorm** tab and chat with the AI about your idea.
2. **Define the Prompt**: Use the **Story Prompt** field to solidify the core concept.
3. **Run S.E.G.A.**: Click the S.E.G.A. button to have the AI populate your ATTG, Style, and DULFS categories automatically.
4. **Use NAI to start writing**: S.E.G.A. runs in the background while you write. You will see 'concurrent generation' errors sometimes if you are using GLM-4.6 for story generation. Just take a breath and try again.
5. **Refine**: Edit any entry manually. Your changes are instantly reflected in the Lorebook.

## Building from Source

```bash
npm install
npm run build    # Outputs to dist/NAI-story-engine.naiscript
npm run test     # Run tests
npm run format   # Format code with Prettier
```

## License

MIT
