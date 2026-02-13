# Crucible — Design Document (v7)

## Overview

The Crucible is a constraint-solver that sits between Brainstorm and Story Engine. It takes raw brainstorm material and transforms it into structured, validated world-building nodes before committing them to DULFS and Canon.

**Problem:** Currently, brainstorm ideas go directly into SEGA which generates everything from scratch. The user has no structured intermediary to review, curate, or shape *what* gets generated before the pipeline runs.

**Solution:** The Crucible extracts structured nodes from brainstorm, lets the user accept/edit/reject them, deepens accepted nodes through iterative solver passes, and commits the result into Story Engine fields.

## Metaphor

A crucible refines raw ore (brainstorm chat) into shaped metal (structured world state). Three phases:
1. **Seeding** — Extract the core intent from brainstorm
2. **Expanding** — Solver proposes nodes; user curates; repeat
3. **Committed** — Accepted nodes map to DULFS items / Canon / fields

## Design Principles
- **Visible causality** — each node shows why it exists via `serves` tags
- **Incremental commitment** — only re-solve from edited nodes downward
- **Edit = ownership** — edited nodes are constraints, never overwritten
- **Gentle challenge** — nudge nodes suggest "most interesting version of what user wants", not redirections
- **No slot machine** — user always adding information and narrowing, never starting over

## Data Model (Implemented)

See `src/core/store/slices/crucible.ts` and types in `src/core/store/types.ts`.

### Node

```
CrucibleNode {
  id: string
  kind: intent | beat | character | faction | location | system | situation | opener
  origin: solver | nudge | user          // who created it
  status: pending | accepted | edited | rejected
  round: number                          // which expansion pass created it
  content: string                        // full text
  summary: string                        // one-line for UI cards
  serves: string[]                       // IDs of nodes this depends on
  stale: boolean                         // invalidated by upstream edit/reject
}
```

### State

```
CrucibleState {
  phase: idle | seeding | expanding | committed
  strategy: CrucibleStrategy | null
  nodes: CrucibleNode[]
  currentRound: number
  windowOpen: boolean
}
```

### Strategies

Narrative lenses that bias node generation:
- `character-driven` — protagonist web, relationships, internal conflicts
- `faction-conflict` — power structures, rivalries, territory
- `mystery-revelation` — secrets, clues, reveals
- `exploration` — geography, discovery, frontiers
- `slice-of-life` — daily routines, community, small stakes
- `custom` — user-defined focus

## Phases & Generation Flow

### Phase 1: Seeding (`crucibleStarted` → `crucibleSeeded`)

**Trigger:** User clicks "Refine in Crucible" from brainstorm or Story Engine panel.

**Generation:** Single GLM call extracts an **intent node** from brainstorm history.
- Input: unified SE prefix + brainstorm history + strategy (if selected)
- Output: One `kind: "intent"` node — the story's central premise distilled
- The intent node is the root; all subsequent nodes ultimately `serve` it

**Prompt design:**
```
[CRUCIBLE — SEED EXTRACTION]
Analyze the brainstorm conversation and extract the core story intent.

Output a JSON object:
{
  "content": "Full description of the story intent (~100-150 words). What is this story ABOUT — not plot, but the central tension, world premise, and emotional core.",
  "summary": "One-line summary (max 80 chars)"
}

If a strategy lens is active: [strategy-specific bias instruction]

Output ONLY the JSON object. No markdown, no explanation.
```

### Phase 2: Expanding (`nodesAdded`, `roundAdvanced`)

**Trigger:** Automatic after seeding, or user clicks "Deepen" for another pass.

**Generation:** GLM proposes nodes that serve the intent + accepted nodes. Each round:
1. Build context: unified prefix + intent + all accepted/edited nodes + strategy lens
2. GLM outputs a JSON array of proposed nodes
3. Nodes arrive with `status: "pending"` — user must accept/edit/reject each
4. User triggers next round when satisfied, or commits

**Prompt design (per round):**
```
[CRUCIBLE — EXPANSION ROUND {N}]
You are expanding a story world. The intent and accepted elements are below.

[INTENT]
{intent node content}

[ACCEPTED NODES]
{accepted/edited nodes, grouped by kind}

[STRATEGY: {strategy name}]
{strategy-specific expansion instruction}

Propose 3-5 new world elements. Each must SERVE at least one existing node.
Prioritize gaps: if no locations exist, propose locations. If characters lack
factions, propose factions. Follow the interconnection principle — no isolates.

Output a JSON array:
[
  {
    "kind": "character|faction|location|system|situation|beat|opener",
    "content": "Detailed description (~80-120 words)",
    "summary": "One-line summary (max 80 chars)",
    "serves": ["id-of-node-this-supports", ...]
  }
]

Output ONLY the JSON array. No markdown, no explanation.
```

**Nudge node:** Each expansion round MAY include one `origin: "nudge"` node — a gentle challenge that pushes the story in a more interesting direction. Always rejectable. The prompt includes:
```
Additionally, propose ONE "nudge" — a surprising element that makes the world
more interesting. Mark it with "nudge": true. The user can always reject it.
```

### Phase 3: Commit (`crucibleCommitted`)

**Trigger:** User clicks "Commit to Story Engine".

**Mapping rules:**
| Node Kind | Target |
|---|---|
| `intent` | Canon field (merged into world/structure section) |
| `character` | DULFS: Dramatis Personae (creates item + lorebook entry) |
| `faction` | DULFS: Factions |
| `location` | DULFS: Locations |
| `system` | DULFS: Universe Systems |
| `situation` | DULFS: Situational Dynamics |
| `beat` | Stored as metadata (future: scene planner) |
| `opener` | Bootstrap instruction (scene opening) |

Commit dispatches existing actions (`dulfsItemAdded`, `fieldUpdated`, etc.) — the Crucible doesn't bypass the store. Only nodes with `status: "accepted" | "edited"` are committed. Rejected/pending are discarded.

After commit, the user can run SEGA to flesh out the seeded entries (lorebook content + keys).

## Strategy-Specific Bias Instructions

Each strategy adds a paragraph to the expansion prompt:

- **character-driven:** "Prioritize characters with conflicting motivations. Every proposed character should have a relationship tension with at least one existing character. Propose situations that force character choices."
- **faction-conflict:** "Prioritize factions and power structures. Characters should be members or opponents of factions. Locations should be contested or strategic. Situations should involve faction interests colliding."
- **mystery-revelation:** "Prioritize secrets, hidden information, and asymmetric knowledge. Characters should have something to hide. Locations should contain clues. Situations should involve information being revealed or suppressed."
- **exploration:** "Prioritize locations, world systems, and frontiers. Characters should be discoverers or gatekeepers. Situations should involve the unknown or the boundary between known and unknown."
- **slice-of-life:** "Prioritize mundane but meaningful details — daily routines, community bonds, small personal stakes. Characters should have domestic concerns alongside larger tensions. Locations should feel lived-in."
- **custom:** User provides a free-text focus instruction stored in storyStorage (`kse-crucible-custom-strategy`).

## UI (Window Extension)

The Crucible UI is a **floating window** (`api.v1.ui.window.open()`), not a sidebar panel. This gives it screen real estate independent of the brainstorm/SE panels.

### Layout

```
┌─ Crucible ──────────────────────────────────┐
│ [Strategy: character-driven ▾]  [Round: 2]  │
│─────────────────────────────────────────────│
│ ◆ INTENT                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ A smuggler's life-debt draws her into   │ │
│ │ a three-way faction war over...         │ │
│ │                          [✓] [✎] [✗]   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ◆ CHARACTERS                                │
│ ┌─────────────────────────────────────────┐ │
│ │ Kael — Smuggler bound by debt           │ │
│ │                          [✓] [✎] [✗]   │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚠ Voss — Iron Pact enforcer (STALE)    │ │
│ │                          [✓] [✎] [✗]   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ◆ FACTIONS  ...                             │
│─────────────────────────────────────────────│
│ [Deepen]              [Commit to SE]        │
└─────────────────────────────────────────────┘
```

### Node display
- **Collapsed** (default): one-line summary + status icon + accept/edit/reject buttons
- **Expanded** (click to toggle): full editable text + relationship tags (`serves: [...]`)
- Stale nodes show yellow warning indicator
- Nodes grouped by `kind`, ordered by round within each group
- Nudge nodes visually distinct (italic? different accent?)

### Interactions
- **Strategy dropdown** — dispatch `strategySelected`
- **Accept (✓)** — dispatch `nodeStatusChanged({ id, status: "accepted" })`
- **Edit (✎)** — opens inline edit → dispatch `nodeEdited({ id, content, summary })`
- **Reject (✗)** — dispatch `nodeStatusChanged({ id, status: "rejected" })` (marks dependents stale)
- **Deepen** — triggers next expansion round generation
- **Commit** — maps accepted nodes to SE fields, dispatches `crucibleCommitted`
- **Window toggle** — `windowToggled` action, entry point from brainstorm/SE panel button

## Context Strategy

Crucible generations use `buildStoryEnginePrefix()` (same unified prefix as all SE strategies) plus a volatile tail with crucible-specific instructions:

- MSG 1-4: shared prefix (system prompt, story state, DULFS, story text)
- MSG 5: crucible instruction (seed extraction or expansion round)
- MSG 6: assistant prefill (`{` for seed, `[` for expansion)

Cache benefit: if the user runs Crucible after brainstorming, the prefix is already cached.

## Generation Strategies (code)

New file: `src/core/utils/crucible-strategy.ts`

Exports:
- `createCrucibleSeedFactory(getState): MessageFactory`
- `createCrucibleExpandFactory(getState): MessageFactory`
- `buildCrucibleSeedStrategy(getState): GenerationStrategy`
- `buildCrucibleExpandStrategy(getState): GenerationStrategy`

New `GenerationStrategy.target` variants:
```typescript
| { type: "crucibleSeed" }
| { type: "crucibleExpand"; round: number }
```

New generation handler in `effects/generation-handlers.ts` for `crucibleSeed` and `crucibleExpand`:
- Parse accumulated JSON text
- Seed: dispatch `crucibleSeeded({ node })` with `id: api.v1.uuid()`, `kind: "intent"`, `origin: "solver"`, `status: "pending"`, `round: 0`
- Expand: dispatch `nodesAdded({ nodes })` with generated IDs, `round: currentRound`, `status: "pending"`

## Config (project.yaml)

Two new config fields:
- `crucible_seed_prompt` — prompt template for seed extraction
- `crucible_expand_prompt` — prompt template for expansion rounds

## Persistence

Already wired — `CrucibleState` persists via `kse-persist` alongside story and brainstorm.

## Implementation Order

1. ~~**State slice + types**~~ ✅ (committed)
2. **Prompts + generation strategies** — `crucible-strategy.ts`, config fields in project.yaml, target variants in types.ts, generation request type
3. **Generation handlers** — JSON parsing, node dispatch
4. **Effects** — wire crucible UI actions to generation pipeline (seed on `crucibleStarted`, expand on deepen)
5. **UI** — Window with node cards, strategy picker, deepen/commit buttons
6. **Commit logic** — node-to-DULFS/Canon mapping, dispatch existing store actions

## Open Questions

- Should "Deepen" auto-run on accept (solver proposes more after each curation), or only on explicit button press? → **Leaning explicit** to avoid overwhelming the user.
- Nudge: one per round always, or configurable? → Start with one per round, always rejectable.
- Beat and opener nodes: store-only for now, or wire to actual scene generation? → **Store-only for v7**, flag for future.
- Custom strategy: free-text input stored where? → `storyStorage` key `kse-crucible-custom-strategy`.
- Should JSON output use structured generation / constrained decoding if GLM supports it? → No, parse manually with fallback.
