# Story Engine

**Story Engine** is a structured worldbuilding system for **NovelAI**. It guides you from a raw idea to a fully populated story scenario through a four-step pipeline: brainstorm → Foundation → Forge → write.

## Key Features

### Brainstorm

A dedicated tab for freeform idea conversation with the AI. Supports multiple named sessions, a summarize button to compress long chats into dense material, and Co/Crit mode toggle (cowriter vs. critic persona).

### Foundation

Sets the structural and tonal anchors for your story before worldbuilding begins:

- **Intensity** — Tonality register: Cozy, Grounded, Gritty, Noir, or Nightmare.
- **Shape** — AI reads your brainstorm and invents a structural lens: the kind of moment your story is building toward. Edit or generate.
- **Intent** — A plain statement of what this story is exploring.
- **Story Contract** — Three directives: REQUIRED, PROHIBITED, EMPHASIS.
- **ATTG** — Author/Title/Tags/Genre block, synced to Memory.
- **Style** — Prose style guidelines, synced to Author's Note.

### Forge

Iterative world element generation. The Forge reads your Foundation and Brainstorm, then builds characters, locations, factions, systems, dynamics, and topics through a guidance-driven loop. Provide optional guidance each pass to steer what gets built.

### World

The world inventory produced by the Forge. Entities are organized by category and can be grouped into **Threads** — named clusters of related entities that provide relational context for generation and optionally sync a summary to the lorebook.

### S.E.G.A. (Story Engine Generate All)

One-button lorebook completion. Runs two stages:

1. **Lorebook Content** — Generates detailed entry text for every world entity.
2. **Lorebook Keys** — Generates activation keys for each entry.

Each stage can also be triggered individually from an entity's edit pane.

### Import Wizard

For stories that already have lorebook entries, Memory, or Author's Note content. Opens automatically on first load when existing content is detected; also accessible via the **Import** button in the panel header.

- **Memory → ATTG** and **A/N → Style** — one-click import of existing story metadata into Foundation fields.
- **Story → Shape + Intent** — generates Foundation anchors by reading your existing story context (lorebook, Memory, document).
- **Per-entry binding** — lists all unmanaged lorebook entries with auto-detected category; click Bind to register as a Story Engine entity without touching the entry text.
- **Import All** — imports all of the above in one click, then triggers Shape and Intent generation.

**Lorebook entries are never destroyed by Story Engine.** Removing the script or clearing entities does not affect the lorebook. Binding is a lightweight management layer that can be rebuilt at any time.

### Entity Edit Pane

Click any entity to open its edit pane:
- Edit name, summary, and category (draft entities)
- View and regenerate lorebook content and keys (live entities)
- Refine entries with natural language: _"make her taller," "add a rivalry with the Silver Court"_

## Installation

1. **Download** the latest `.naiscript` file from the [Releases](https://github.com/your-repo/releases) page.
2. **Create a new story** in NovelAI for this script.
3. **Open the Script Editor** in NovelAI, import the `.naiscript` file.
4. **Enable the script.** The Story Engine panel will appear in the sidebar.

For the full workflow walkthrough, see `WALKTHROUGH.md`.

## Building from Source

```bash
npm install
npm run build    # Outputs to dist/NAI-story-engine.naiscript
npm run test     # Run tests
```

## License

MIT
