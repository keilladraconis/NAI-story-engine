# Story Engine

**Story Engine** is a structured worldbuilding system for **NovelAI**. It guides you from a raw idea to a fully populated story scenario through a four-step pipeline: brainstorm → Foundation → Forge → write. An optional **Bootstrap** generator can also write the opening passage of your story directly into the document when you're ready to begin.

The UI is built on **`nai-simple-ui`**, the component framework from OnepunchVAM's **Simple Context** — with thanks for the foundation.

## Key Features

### Chat — Brainstorm, Summary, Refine

A single **Chat** tab hosts every conversational surface in Story Engine, driven by a typed chat-session registry:

- **Brainstorm** — Freeform idea conversation with the AI. Supports multiple named sessions and a Co/Crit mode toggle (cowriter vs. critic persona).
- **Summary** — Clicking **Sum** on a brainstorm spawns a separate, iterable Summary chat seeded from the transcript. Downstream generation reads the summary's latest assistant turn, so you can shape exactly what the Forge sees without losing the raw brainstorm.
- **Refine** — A field-level chat scoped to a single Foundation field or lorebook entry. See _Field-Level Refine_ below.

### Foundation

Sets the structural and tonal anchors for your story before worldbuilding begins:

- **Intensity** — Tonality register: Cozy, Grounded, Gritty, Noir, or Nightmare.
- **Shape** — AI reads your brainstorm and invents a structural lens: the kind of moment your story is building toward. Edit or generate.
- **Intent** — A plain statement of what this story is exploring.
- **Story Contract** — Three directives: REQUIRED, PROHIBITED, EMPHASIS.
- **ATTG** — Author/Title/Tags/Genre block, synced to Memory.
- **Style** — Prose style guidelines, synced to Author's Note.

Intent, Story Contract, ATTG, and Style each expose a paired **Generate** + **Refine** button — see _Field-Level Refine_ below.

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
- Refine the lorebook content via a scoped chat session: _"make her taller," "add a rivalry with the Silver Court"_

### Field-Level Refine

A **Refine** button (feather icon) sits next to the **Generate** button on every iterable field: Foundation **ATTG**, **Style**, **Intent**, **Story Contract**, and each entity's **Lorebook Content**. Clicking Refine opens a chat scoped to that field on the **Chat** tab, with the current field text pinned as a dashed-border **Context** bubble at the top of the conversation. Iterate with plain-language instructions, then **Commit** to write the latest candidate back into the field — or **Discard** to leave it untouched.

Refine sessions are ephemeral (not saved in the session list), and the panel returns you to whichever tab you came from when you commit or discard.

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

## Upgrading

### From 0.11.x

0.12 introduces a typed chat-session system: the old `brainstorm` slice and its panel are replaced by a unified **Chat** tab driven by a registry under `src/core/chat-types/`. Existing brainstorm chats are migrated automatically on first load — a small toast confirms the migration and the old persisted key is cleared.

Behaviorally:

- **Sum** spawns a separate, iterable **Summary chat** instead of rewriting the brainstorm in place. Generation reads the summary's latest assistant turn.
- A field-level **Refine** button (feather icon) is now available on ATTG, Style, Intent, Story Contract, and each entity's Lorebook Content. The inline lorebook refine input from 0.11.x is gone — refine now flows through the chat infrastructure.

### From 0.10.x

Two Foundation fields from the old Crucible flow are gone:

- **Direction** — superseded by **Brainstorm's summary mode**. Summarize your Brainstorm chat (the **Sum** button, which as of 0.12 opens an iterable Summary chat) and the Forge reads that directly; you no longer need to maintain Direction and Brainstorm as parallel sources of framing.
- **Canon** — removed with no direct replacement. Its job is now covered by **Story Contract** (REQUIRED / PROHIBITED / EMPHASIS) in Foundation plus the per-entity summaries in the World section.

See `CHANGELOG.md` for the full 0.11.x and 0.12.0 notes.

## License

MIT
