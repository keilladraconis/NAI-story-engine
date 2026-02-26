# Story Engine

**Story Engine** is a structured worldbuilding system for **NovelAI**. It guides you from a raw idea to a fully populated story scenario through a four-step pipeline: brainstorm → Crucible → SEGA → write.

## Key Features

### Brainstorm

A dedicated sidebar panel for freeform idea conversation with the AI. Supports multiple named sessions, a summarize button to compress long chats into dense material, and Co/Crit mode toggle for different AI personas.

### Crucible — Backward-Reasoning World Generator

Crucible derives your world directly from dramatic endpoints. Give it a direction and a goal; it reasons backward to discover what the world must contain.

1. **Direction** — AI distills your brainstorm into a dense creative anchor (characters, tone, tensions, narrative architecture).
2. **Goals** — AI generates dramatic endpoints with shape detection (Climactic Choice, Spiral Descent, Threshold Crossing, etc.) and a `why` for each goal. Star the ones worth building.
3. **Build World** — For each starred goal, Crucible derives prerequisites (relationships, secrets, histories, power structures) then generates world elements (characters, locations, factions, systems, situations) that satisfy them.
4. **Review & Merge** — Edit elements before merging them into DULFS fields and lorebook. Expand any element post-merge to branch into deeper generation.

### S.E.G.A. (Story Engine Generate All)

One-button scenario completion. Runs through: ATTG & Style → Canon → Bootstrap → Lorebook. Each stage can also be run individually.

- **ATTG & Style** — Author/Title/Tags/Genre syncs to Memory; Style Guidelines syncs to Author's Note.
- **Canon** — Authoritative world summary synthesized from your Crucible elements.
- **Bootstrap** — Generates an opening scene instruction into the document if it's empty.
- **Lorebook** — Content generation → relational maps → keys generation (map-informed, with reconciliation pass for complex entries).

### DULFS & Lorebook Sync

Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics. Every DULFS entry is bidirectionally synced with the NovelAI Lorebook — edits in either direction are reflected immediately.

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
