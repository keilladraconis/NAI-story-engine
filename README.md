# Story Engine

**Story Engine** is a structured worldbuilding system for **NovelAI**. It guides you from a raw idea to a fully populated story scenario through a four-step pipeline: brainstorm → Foundation → Forge → write. An optional **Bootstrap** generator can also write the opening passage of your story directly into the document when you're ready to begin.

The UI is built on **`nai-simple-ui`**, the component framework from OnepunchVAM's **Simple Context** — with thanks for the foundation.

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

Intent-driven world element generation. The Forge reads your Foundation and Brainstorm, then builds characters, locations, factions, systems, dynamics, and topics through a 12-step phased loop:

- **Sketch** (steps 1–4) — breadth-first population of elements in broad strokes.
- **Expand** (steps 5–8) — deepen thin entries, add noticeable gaps, cut overlap.
- **Weave** (steps 9–12) — thread structural bonds and spin up situation entries at collision points.

Provide optional guidance up front to steer what gets built; the model can end early once the world feels complete.

### Bootstrap

One-button **cold-open writer** in the panel header. Runs a two-phase generation that writes the first passages of your story directly into the document — grounded in your Shape, Intent, and Brainstorm, with prompts tuned to avoid named emotions, participle-stack appositives, and thematic narration. Phase 2 streams paragraph by paragraph so the document undo history stays clean.

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

## Upgrading from 0.10.x

Two Foundation fields from the old Crucible flow are gone:

- **Direction** — superseded by **Brainstorm's summary mode**. Summarize your Brainstorm chat (the **Sum** button) and the Forge reads that directly; you no longer need to maintain Direction and Brainstorm as parallel sources of framing.
- **Canon** — removed with no direct replacement. Its job is now covered by **Story Contract** (REQUIRED / PROHIBITED / EMPHASIS) in Foundation plus the per-entity summaries in the World section.

See `CHANGELOG.md` for the full 0.11.0 notes.

## License

MIT
