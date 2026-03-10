# Story Engine

**Story Engine** is a structured worldbuilding system for **NovelAI**. It guides you from a raw idea to a fully populated story scenario through a four-step pipeline: brainstorm → Crucible → SEGA → write.

## Key Features

### Brainstorm

A dedicated sidebar panel for freeform idea conversation with the AI. Supports multiple named sessions, a summarize button to compress long chats into dense material, and Co/Crit mode toggle for different AI personas.

### Crucible — Command-Driven World Generator

Crucible derives your world from structural tensions. Give it a shape and a direction; it identifies the pressures at the core of your story, then builds a world around them through an iterative command loop.

1. **Shape** — AI reads your brainstorm and invents the structural lens your story is leaning toward — any shape, from Climactic Choice to Slice of Life. Edit the name and instruction directly, or generate and refine.
2. **Direction** — AI distills your brainstorm (informed by the shape) into a dense creative anchor: characters, world, tone, tensions, supporting cast.
3. **Tensions** — AI identifies the structural pressures and irresolvable conflicts at the heart of the scenario. Accept the ones worth building.
4. **Build World** — GLM runs a command loop, emitting `CREATE`, `REVISE`, `LINK`, and `DELETE` commands to build world elements (characters, locations, factions, systems, narrative vectors, topics) that embody the tensions. Each pass ends with a self-`CRITIQUE`; you can add guidance and run another pass to extend or refine.
5. **Merge** — Edit elements and merge them into DULFS fields and lorebook.

### S.E.G.A. (Story Engine Generate All)

One-button scenario completion. Runs through: ATTG & Style → Canon → Bootstrap → Lorebook. Each stage can also be run individually.

- **ATTG & Style** — Author/Title/Tags/Genre syncs to Memory; Style Guidelines syncs to Author's Note.
- **Canon** — Authoritative world summary synthesized from your Crucible elements.
- **Bootstrap** — Generates an opening scene instruction into the document if it's empty.
- **Lorebook** — Content generation → relational maps → keys generation (map-informed, with reconciliation pass for complex entries).

### DULFS & Lorebook Sync

Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics, and Topics. Every DULFS entry is bidirectionally synced with the NovelAI Lorebook — edits in either direction are reflected immediately.

### Lorebook Panel

Generate content, keys, and refinements for any lorebook entry directly from the Lorebook view. Natural language refinements: "make her taller," "add a rivalry with the Silver Court."

## Installation

1. **Download** the latest `.naiscript` file from the [Releases](https://github.com/your-repo/releases) page.
2. **Create a new story** in NovelAI for this script.
3. **Open the Script Editor** in NovelAI, import the `.naiscript` file.
4. **Enable the script.** The Brainstorm, Crucible, and Story Engine panels will appear.

For the full workflow walkthrough, see `WALKTHROUGH.md`.

## Building from Source

```bash
npm install
npm run build    # Outputs to dist/NAI-story-engine.naiscript
npm run test     # Run tests
```

## License

MIT
