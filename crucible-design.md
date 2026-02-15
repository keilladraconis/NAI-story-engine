# Crucible v4 — Backward-Chain World Generator

## Overview

The Crucible bridges Brainstorm → Story Engine. It uses **backward chaining from narrative goals** to derive world elements (characters, factions, locations, systems, situations). The backward chain is a world generation technique, not a plot planner — beats are scaffolding; the real outputs are the world elements that emerge as *requirements* of the narrative logic. Multiple goals ensure every element has multiple possible trajectories: anti-destination, not predestination.

**Problem:** Brainstorm produces raw conversation. Story Engine needs structured world elements. The gap between them requires a system that can extract narrative intent, derive what the world *must* contain to support that intent, and populate DULFS categories with purposeful elements.

**Solution:** Extract goals from brainstorm → backward-chain from each goal to derive world elements → merge elements across goals into a unified world inventory → populate DULFS.

## Pipeline

```
Brainstorm Chat Log
        │
        ▼
┌─────────────────┐
│  Goal Extraction │  → 3-5 Goal scenarios with Terminal Conditions
└────────┬────────┘
         │ User selects goals
         ▼
┌─────────────────────┐
│  Backward Chaining   │  Per goal: chain of beats → emergent world elements
│  (per goal, auto)    │  Pauses at structural checkpoints for user review
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  World Element Merge │  Unify elements across goals → multi-purpose inventory
└────────┬────────────┘
         │ User reviews merged world
         ▼
┌─────────────────────┐
│  DULFS Population    │  Feed merged elements into Story Engine fields
└─────────────────────┘
```

## Design Principles

- **Anti-destination** — Goals define possible futures, not predetermined endings. The world elements that emerge serve multiple trajectories. When the user "presses play," actors move toward open-ended outcomes.
- **Narrative necessity** — Every world element exists because the backward chain required it. No decorative invention. If a character exists, it's because a beat needed them.
- **Scaffolding vs. product** — Beats are the reasoning scaffold. World elements are the product. The user cares about the world, not the beat sequence.
- **One step at a time** — The solver exposes beats incrementally, auto-running but pausing at structural checkpoints (major character introductions, act boundaries, constraint explosion).

## Phase 1: Goal Extraction

**Input:** Full brainstorm chat log.

**Task:** GLM reads the chat and identifies the user's *unstated* intent — what the story should accomplish, not just what was discussed. Derives 3-5 Goal scenarios.

**Output format per goal:**
```
Goal: [one-line statement]
Stakes: [what's at risk if this goal fails]
Theme: [the thematic question this goal explores]
Emotional Arc: [what the reader should feel at resolution]
Terminal Condition: [concrete, observable story state when goal is achieved]
```

The **Terminal Condition** anchors backward chaining. Without something concrete to decompose, the solver has no starting point. Examples:
- "The colony ship arrives at its destination, but the crew discovers it's already inhabited"
- "The detective solves the case but realizes the true criminal is their mentor"
- "The kingdom fractures into three successor states, each claiming legitimacy"

**Context layout:**
```
MSG 1 (system): Narrative architect role + output format spec
MSG 2 (user): [full chat log]
MSG 3 (user): Derive 3-5 goals with terminal conditions
```

**User checkpoint:** User selects which goals to pursue (1 or more). Unselected goals are discarded.

## Phase 2: Backward Chaining

For each selected goal, run an autonomous backward-chaining loop. Goals are processed as separate chains (not interleaved).

### The Solver Loop

**Iteration 0 — Terminal Beat:**
The first beat is the scene where the Terminal Condition becomes true.

**Iteration N — Backward step:**
1. Review OPEN CONSTRAINTS (preconditions that haven't been established yet)
2. Design the **latest-possible** beat that establishes ≥1 open constraint
3. The new beat may introduce new open constraints (its own preconditions)
4. Constraints needing no prior setup are marked **GROUND STATE** (true at story start)
5. **Terminate** when all constraints are resolved or ground state

**Beat format:**
```
Beat:
  Scene: [what happens — 2-3 sentences]
  Characters Present: [who + why they must be there]
  Location: [where + why it matters]
  Conflict/Tension: [what's at stake in this moment]
  World Elements Introduced:
    - Characters: [new characters with role descriptions]
    - Locations: [new locations with significance]
    - Factions: [new factions/groups]
    - Systems: [new world rules/mechanics]
    - Situations: [new tensions/dynamics]
  Constraints Resolved: [which open constraints this beat establishes]
  New Open Constraints: [preconditions this beat requires]
  Ground State Constraints: [preconditions true at story start, no setup needed]
```

### Prompt Structure (per iteration)

```
MSG 1 (system):
You are working backwards from a story's climax toward its opening.
You are given established beats and a list of open constraints —
things that must be true but haven't been established yet.

Design the NEXT beat backward (the latest-possible scene that
establishes one or more open constraints).

Rules:
- Each beat must establish ≥1 open constraint
- Each beat must declare its own preconditions (new open constraints)
- World elements emerge from narrative necessity — never invented decoratively
- "Latest-possible" — stay close to the goal before stepping further back
- Ground-state constraints need no prior beat — mark as RESOLVED
- Every beat must contain conflict, tension, or revelation — never pure exposition

MSG 2 (user):
GOAL: [statement + terminal condition]

ESTABLISHED BEATS (newest-first, i.e. closest to the goal first):
[all beats generated so far]

OPEN CONSTRAINTS:
- [constraint] (from Beat N)
- [constraint] (from Beat N-1)

RESOLVED CONSTRAINTS:
- [constraint] → ground state
- [constraint] → established by Beat M

WORLD ELEMENTS DERIVED SO FAR:
- Characters: [accumulated list]
- Locations: [accumulated list]
- Factions: [accumulated list]
- Systems: [accumulated list]
- Situations: [accumulated list]

MSG 3 (user): Design the next beat backward.
```

### Why This Works with GLM 4.6

- **200K context** holds the full beat history, preventing contradictions without a separate consistency pass
- **Structured constraint tracking** gives the LLM a clear "game state" to reason about
- **One beat per call** keeps reasoning sharp — long multi-beat generations lose causal discipline
- **Newest-first ordering** keeps the most causally relevant beats closest to the generation point
- **No tool use needed** — all structure via prompted output format

### Checkpoints (Auto-Pause)

The solver runs autonomously but pauses for user review when:
- A **major character** is first introduced (protagonist, antagonist, mentor figure)
- The chain reaches an approximate **act boundary** (estimated from beat count and constraint depth)
- **Constraint explosion** — open constraints grow by >2 per beat for 3 consecutive beats
- A **contradiction** is detected with earlier beats

At checkpoints, the user can:
- Accept and continue
- Edit the latest beat (modifying elements or constraints)
- Reject the latest beat and have the solver retry
- Manually mark constraints as ground state (to limit chain depth)

### Failure Modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Constraint explosion | Open count growing faster than resolving | Pause, ask user to mark some as ground state |
| Circular dependency | Beat requires something already established differently | Full history in context prevents this; flag if detected |
| Bland beats | No conflict/tension in output | System prompt rule; can re-prompt with "this beat needs more tension" |
| Chain too long | Beat count exceeds threshold (~15-20) | Prompt to consolidate remaining constraints into fewer beats |

## Phase 3: World Element Merge

After all goals complete backward chaining, merge the per-goal world element inventories.

### Step 1: Element Mapping

Give GLM all chains' world elements side by side. Ask for a mapping:
- "Character X in Goal A = Character Y in Goal B" (or "distinct")
- Same for locations, factions, systems, situations
- Flag contradictions (same element with incompatible properties)

### Step 2: Unified World Inventory

With the mapping applied, GLM produces a single world inventory where:
- Each element has its **multi-goal narrative purpose** (why it matters to each goal chain)
- Characters have **competing motivations** from different goal chains → open-ended agency
- Locations serve **multiple narrative functions** → rich, layered settings
- Contradictions are resolved by GLM with rationale

**This is the major user checkpoint.** The user reviews the merged world. The beats (scaffolding) are available on request for justification, but the primary artifact is the world element inventory.

### Why Multi-Goal Elements Create Open-Endedness

A character derived from one goal chain has a clear motivation. The same character appearing in two goal chains has *competing* motivations. This is the source of open-ended possibility — when the user "presses play," the character can move toward either goal, creating genuine narrative tension rather than predetermined outcomes.

## Phase 4: DULFS Population

The merged world elements map directly to Story Engine categories:

| Element Type | DULFS Category |
|---|---|
| Characters | Dramatis Personae |
| Systems | Universe Systems |
| Locations | Locations |
| Factions | Factions |
| Situations | Situational Dynamics |

Each element becomes a DULFS entry with:
- **Name and description** from the merged inventory
- **Narrative purpose** from the multi-goal analysis
- **Relationships** to other elements from the beat scaffolding

After population, the user can run SEGA to generate lorebook content + keys for each entry.

## GLM 4.6 Prompting Notes

- **Temperature 1.0** for all creative generation
- **Structured output** via format specs in the prompt — GLM responds well to explicit field definitions
- **No tool use** (unsupported) — all structure via prompted JSON/structured text
- **No template** — context built manually via messages array
- **Optional thinking** — useful for the merge step where reasoning is complex
- **System messages kept concise** — format specs and examples in user messages

## State Model

```
CrucibleState {
  phase: idle | goals | chaining | merging | reviewing | populating
  goals: CrucibleGoal[]              // extracted goals with selection status
  chains: Map<goalId, CrucibleChain> // per-goal backward chains
  mergedWorld: MergedWorldInventory | null
  checkpointReason: string | null    // why the solver paused
}

CrucibleGoal {
  id: string
  goal: string
  stakes: string
  theme: string
  emotionalArc: string
  terminalCondition: string
  selected: boolean
}

CrucibleChain {
  goalId: string
  beats: CrucibleBeat[]
  openConstraints: Constraint[]
  resolvedConstraints: Constraint[]
  worldElements: WorldElements
  complete: boolean
}

CrucibleBeat {
  scene: string
  charactersPresent: string[]
  location: string
  conflictTension: string
  worldElementsIntroduced: WorldElements
  constraintsResolved: string[]
  newOpenConstraints: string[]
  groundStateConstraints: string[]
}

Constraint {
  id: string
  description: string
  sourceBeatIndex: number
  status: open | resolved | groundState
}

WorldElements {
  characters: NamedElement[]
  locations: NamedElement[]
  factions: NamedElement[]
  systems: NamedElement[]
  situations: NamedElement[]
}

MergedWorldInventory {
  elements: MergedElement[]
}

MergedElement {
  name: string
  type: character | location | faction | system | situation
  description: string
  goalPurposes: Map<goalId, string>  // why this element matters to each goal
  relationships: string[]
}
```

## Context Strategy

Crucible generations use `buildStoryEnginePrefix()` (shared unified prefix) plus a volatile tail:

- MSG 1-4: shared prefix (system prompt, story state, DULFS, story text)
- MSG 5+: crucible-specific instruction (goal extraction, beat generation, or merge)

Cache benefit: if the user runs Crucible after brainstorming, the prefix is already cached.

## Implementation Order

1. **State slice refactor** — replace node-based model with goal/chain/beat model
2. **Goal extraction** — prompt + generation strategy + handler
3. **Backward chaining loop** — prompt + strategy + handler + checkpoint logic
4. **World element merge** — prompt + strategy + handler
5. **DULFS population** — mapping logic using existing store actions
6. **UI** — Window with goal selection, beat/constraint visualization, checkpoint controls, merged world review
