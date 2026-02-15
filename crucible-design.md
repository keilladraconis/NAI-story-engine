# Crucible v4 — Backward-Chain World Generator

## Overview

The Crucible bridges Brainstorm → Story Engine. It uses **backward chaining from narrative goals** to derive world elements (characters, factions, locations, systems, situations). The backward chain is a world generation technique, not a plot planner — beats are scaffolding; the real outputs are the world elements that emerge as *requirements* of the narrative logic. Multiple goals ensure every element has multiple possible trajectories: anti-destination, not predestination.

**Problem:** Brainstorm produces raw conversation. Story Engine needs structured world elements. The gap between them requires a system that can extract narrative intent, derive what the world *must* contain to support that intent, and populate DULFS categories with purposeful elements.

**Solution:** Derive intent from brainstorm → extract goals → backward-chain from each goal to derive world elements → merge elements across goals into a unified world inventory → populate DULFS.

## Pipeline

```
Brainstorm Chat Log
        │
        ▼
┌─────────────────┐
│  Derive Intent   │  → Core tension, world premise, narrative direction, tags
└────────┬────────┘
         │ User reviews & edits
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

## Tagged Text Format (Streaming-First)

All Crucible output uses tagged plaintext (`[TAG] content`) instead of JSON. Benefits:
- **Streams visibly** as markdown during generation
- **Truncation-safe** — partial output still renders readable text
- **Token-efficient** — no JSON syntax overhead under tight 1024-token budgets
- **Natural to GLM** — tagged text is natural language, not a format the model must learn

### Intent Format
```
[CORE TENSION] The central dramatic opposition
[WORLD PREMISE] The foundational reality of the setting
[NARRATIVE DIRECTION] The trajectory of narrative momentum
[TAGS] tag1, tag2, tag3
```

### Goal Format (+++ separated)
```
+++
[GOAL] One-line goal statement
[STAKES] What's at risk
[THEME] Thematic question
[EMOTIONAL ARC] Reader's feeling at resolution
[TERMINAL CONDITION] Concrete observable state
+++
```

### Beat Format
```
[SCENE] What happens — 2-3 sentences
[CHARACTERS] Name — reason; Name — reason
[LOCATION] Place — significance
[CONFLICT] What's at stake
[WORLD ELEMENTS]
- Character: Name — role/motivation
- Location: Name — significance
- Faction: Name — goal/method
- System: Name — mechanic/rule
- Situation: Name — tension/dynamic
[RESOLVED] constraint1; constraint2
[OPEN] constraint1; constraint2
[GROUND] constraint1; constraint2
```

### Merged Element Format (+++ separated)
```
+++
[NAME] Element name
[TYPE] character|location|faction|system|situation
[DESCRIPTION] Unified description
[PURPOSE] Goal1: purpose; Goal2: purpose
[RELATIONSHIPS] name1, name2
+++
```

## Design Principles

- **Anti-destination** — Goals define possible futures, not predetermined endings. The world elements that emerge serve multiple trajectories. When the user "presses play," actors move toward open-ended outcomes.
- **Narrative necessity** — Every world element exists because the backward chain required it. No decorative invention. If a character exists, it's because a beat needed them.
- **Scaffolding vs. product** — Beats are the reasoning scaffold. World elements are the product. The user cares about the world, not the beat sequence.
- **Streaming-first** — All output streams as readable tagged text. The UI shows generation progress in real-time.
- **One step at a time** — The solver exposes beats incrementally, auto-running but pausing at structural checkpoints (major character introductions, act boundaries, constraint explosion).

## Phase 0: Intent Derivation

**Input:** Full brainstorm chat log + story state.

**Task:** GLM distills the user's creative direction into a structured intent framework — core tension, world premise, narrative direction, and genre/tone tags. This captures the brainstorm's essence for downstream goal extraction.

**User checkpoint:** User reviews, edits, and confirms the derived intent (or skips to goals directly).

## Phase 1: Goal Extraction

**Input:** Derived intent (if confirmed) or full brainstorm.

**Task:** GLM identifies 3-5 goal scenarios with terminal conditions, informed by the intent.

**User checkpoint:** User selects which goals to pursue (1 or more). Unselected goals are discarded.

## Phase 2: Backward Chaining

For each selected goal, run an autonomous backward-chaining loop. Goals are processed as separate chains (not interleaved).

### The Solver Loop

**Iteration 0 — Terminal Beat:** The first beat is the scene where the Terminal Condition becomes true.

**Iteration N — Backward step:**
1. Review OPEN CONSTRAINTS (preconditions that haven't been established yet)
2. Design the **latest-possible** beat that establishes ≥1 open constraint
3. The new beat may introduce new open constraints (its own preconditions)
4. Constraints needing no prior setup are marked **GROUND STATE** (true at story start)
5. **Terminate** when all constraints are resolved or ground state

### Checkpoints (Auto-Pause)

The solver runs autonomously but pauses for user review when:
- A **major character** is first introduced (protagonist, antagonist, mentor figure)
- **Constraint explosion** — open constraints grow by >2 per beat for 3 consecutive beats
- Chain reaches **15 beats** — consider consolidating

At checkpoints, the user can:
- Accept and continue
- Reject the latest beat and have the solver retry
- Manually mark constraints as ground state (to limit chain depth)

## Phase 3: World Element Merge

After all goals complete backward chaining, merge the per-goal world element inventories. Elements appearing in multiple goal chains get competing motivations → open-ended agency.

## Phase 4: DULFS Population

The merged world elements map directly to Story Engine categories:

| Element Type | DULFS Category |
|---|---|
| Characters | Dramatis Personae |
| Systems | Universe Systems |
| Locations | Locations |
| Factions | Factions |
| Situations | Situational Dynamics |

## State Model

```
CrucibleState {
  phase: idle | goals | chaining | merging | reviewing | populating
  intent: string | null                  // tagged text (raw)
  goals: CrucibleGoal[]                 // extracted goals with selection status
  chains: Map<goalId, CrucibleChain>    // per-goal backward chains
  mergedWorld: MergedWorldInventory | null
  checkpointReason: string | null       // why the solver paused
}

CrucibleGoal {
  id: string
  text: string       // full tagged text block for this goal
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
  text: string                          // full tagged text block for this beat
  worldElementsIntroduced: WorldElements // parsed from [WORLD ELEMENTS]
  constraintsResolved: string[]         // parsed from [RESOLVED]
  newOpenConstraints: string[]          // parsed from [OPEN]
  groundStateConstraints: string[]      // parsed from [GROUND]
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
  text: string          // full tagged text block for this element
  type: MergedElementType
  name: string          // parsed from [NAME] — kept for DULFS mapping
}
```

## Context Strategy

Crucible generations use `buildStoryEnginePrefix()` (shared unified prefix) plus a volatile tail:

- MSG 1-4: shared prefix (system prompt, story state, DULFS, story text)
- MSG 5+: crucible-specific instruction (intent, goal extraction, beat generation, or merge)

Cache benefit: if the user runs Crucible after brainstorming, the prefix is already cached.

## GLM 4.6 Prompting Notes

- **Temperature 1.0** for all creative generation (0.8 for merge)
- **Tagged text output** via format specs in the prompt — natural, token-efficient, truncation-safe
- **No tool use** (unsupported) — all structure via tagged plaintext
- **No template** — context built manually via messages array
- **Prefill anchors** — assistant prefill starts with first tag (e.g., `[CORE TENSION] `)
- **Continuation** — goals (3 calls) and merge (5 calls) use continuation for long output
