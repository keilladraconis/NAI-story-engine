# Crucible — Design & Theory

Companion to `crucible-ux.md` (the user experience spec). This document covers the reasoning behind the design, what we expect the LLM to do, where it will fail, and how we mitigate those failures.

---

## Purpose

Crucible transforms brainstormed story ideas into a populated world — characters, locations, factions, systems, and dynamics (DULFS) — that supports dramatic storytelling. It works by reasoning backward from dramatic endpoints to discover what the world must contain.

The product is **world elements**. Everything else — scenes, constraints, the backward chain — is scaffolding.

---

## Core Theory

### Why Backward Reasoning?

Forward world-building ("design a kingdom, then populate it") produces encyclopedic but dramatically inert worlds. The user ends up with lore that doesn't generate stories.

Backward reasoning from dramatic endpoints inverts this. Every world element exists because the narrative needs it. A character exists because the climax requires someone with those traits. A faction exists because the tension demands opposing forces. Nothing is decorative — everything is load-bearing.

The technique: Given a dramatic endpoint (Goal), use backward temporal reasoning as a creative constraint to discover what the world must contain.

### What the LLM Actually Does

**Important**: The LLM is not performing formal logical deduction. It is performing **creative exploration constrained by temporal direction**.

When we ask "what dramatic moment earlier in this timeline would set up this scene?", the model generates plausible narrative contexts — not logically necessary preconditions. The "backward" framing is a creative constraint that biases the model toward causally grounded generation, but the output is creative, not deductive.

This is fine. The purpose is **discovery**, not proof. A scene naturally combines characters, locations, power dynamics, and tensions in ways that pure enumeration doesn't. The model discovers world elements through narrative imagination that it wouldn't find through direct "list what this world needs" prompting.

The chain of scenes is scaffolding. The world elements extracted from those scenes are the product.

### Implications for Design

1. **Don't pretend it's deduction.** Prompts should encourage creative exploration, not simulate a logic engine.
2. **The scene chain doesn't need to be formally valid.** Mild inconsistencies between scenes are acceptable because only the world elements matter, and those are maintained in a separate, editable inventory.
3. **Termination is budgeted, not emergent.** Don't wait for the model to "discover" an initial scene. Run a fixed number of rounds, then synthesize.
4. **Consistency lives in the world state, not the chain.** The Builder's element inventory is the source of truth. The Director validates against that, not against scene-to-scene continuity.

---

## Pipeline Architecture

### Overview

```
Direction → Goals → [ Solver → Builder → Director ]* → (Opening Synthesis) → Merge to DULFS
```

The bracketed loop runs per-goal, interleaved, with a **shared world state** across goals. The loop repeats until the scene budget is exhausted or all constraints are resolved.

### Step 1: Direction

User writes or AI derives a creative direction from the brainstorm. Includes key characters, narrative vectors, themes, and tags.

- **Generator**: `createCrucibleDirectionFactory`
- **No changes from current implementation.**

### Step 2: Goals

AI generates dramatic endpoints — possible futures for this world. User stars the ones that excite them. Each starred goal becomes a target for backward reasoning.

- **Generator**: `createCrucibleGoalFactory`
- **No changes from current implementation.**

### Step 3: World-Building Loop

For each starred goal, interleave three generators:

#### 3a. Solver

**Job**: Generate a dramatic moment earlier in the timeline that reveals what the world needs to contain.

**Input**: Goal, previous scenes (if any), open/resolved constraints, world element inventory, director guidance.

**Output**: `[SCENE]` text + `[RESOLVED]` constraints (things this scene establishes) + `[OPEN]` constraints (new questions raised).

**Key framing**: The solver is *exploring*, not deducing. Its prompt should encourage discovering interesting world conditions — "what dramatic moment earlier in this timeline would reveal something important about this world?" — not constructing a logical proof.

**Budget**: Maximum N scenes per goal (configurable, default 5). The solver does NOT need to reach an "opener" or "initial scene." It stops when budget is exhausted or all constraints are resolved, whichever comes first. If the model produces an `[OPENER]` tag before budget is exhausted, that's a natural completion — accept it, but don't require it.

**Constraints**: Lightweight descriptions of open questions. They guide exploration but don't formally control it. The code tracks them; the model is invited to resolve or open them. Some constraint growth is healthy — it means the model is discovering complexity.

#### 3b. Builder

**Job**: Extract and update world elements from the latest scene(s).

**Input**: New scene(s) since last build, existing world element inventory.

**Output**: New or updated world elements — characters, locations, factions, systems, situations — tagged with DULFS field IDs.

**Key principle**: Elements are the product. The builder refines them over multiple passes. Early descriptions may reflect later-timeline states; the builder progressively shapes each element toward its *initial condition* — how it exists when the story begins, not at the climax.

**Deduplication**: By short ID (`[ID:xx]`) for explicit updates, by name for implicit merges.

**Element budget**: The prompt asks for essential elements per scene, not exhaustive extraction. Quality over quantity.

#### 3c. Director

**Job**: Assess overall progress and issue guidance.

**Input**: Full snapshot — goal, all scenes, constraints, world elements.

**Output**: `[FOR SOLVER]` and `[FOR BUILDER]` guidance. Can `[REJECT]` bad scenes or `[TAINT Scene N]` questionable ones.

**Key focus**: The director assesses the **world element inventory**, not the scene chain. "Is this world coherent? Is it rich enough? Are elements serving multiple goals (where dramatic tension lives)? Is anything contradictory?"

**Frequency**: Every 2-3 solver cycles.

### Step 4: Opening Synthesis (optional)

When the world-building loop completes, an optional final generation synthesizes the world's **starting situation** — the status quo before dramatic events begin. This becomes the bridge to Story Engine (potentially populating the Story Prompt or Canon).

This step exists because the backward chain doesn't need to converge on a coherent opening. Instead, we synthesize one from the finished world. The opening is a product of the world elements, not the chain.

If the solver naturally produced an `[OPENER]` scene, this step may be unnecessary — the opener already describes where the story begins.

### Step 5: Review & Merge

User reviews world elements, edits/deletes, then merges into Story Engine DULFS fields. Per `crucible-ux.md`.

---

## World State Model

### World Elements

Each element has:
- **name**: Display name
- **content**: Description (evolves over builder passes toward initial-state)
- **fieldId**: DULFS category
- **shortId**: Stable identifier (C0, C1 for characters; L0, L1 for locations; etc.)
- **goalIds**: Which goals this element serves — elements serving multiple goals are the most valuable, that's where tension lives

### Constraints

Lightweight exploration guidance:
- **description**: What needs to be addressed
- **status**: open | resolved | groundState
- **shortId**: Stable identifier (X0, X1, etc.)

Constraints guide the solver's exploration but don't formally control it. Code tracks them; the model is encouraged to resolve and open them naturally.

Ground-state constraints represent foundational world truths that don't need further backward chaining — they just *are*.

### Shared State Across Goals

All goals share one world element inventory. When Goal A's builder creates a character, Goal B's solver sees that character in its context. Multi-goal coherence emerges through shared world state, not explicit cross-referencing.

---

## Failure Modes & Mitigations

### 1. Causal Hand-Waving — HIGH risk

**Problem**: Scenes feel narratively connected but aren't causally grounded. The model generates plausible preconditions, not necessary ones.

**Mitigation**: Accept this. The scenes are scaffolding. What matters is whether the world elements are individually coherent and collectively interesting. The Director checks world coherence, not chain validity. If the world is good, the chain did its job regardless of whether each step was logically necessary.

### 2. Consistency Drift — HIGH risk

**Problem**: Later scenes contradict earlier ones, or world elements get inconsistent descriptions across builder passes.

**Mitigation**: (a) Short chains — budget of ~5 scenes per goal. (b) Director validates against the world element inventory, not scene history. (c) Full world state in every prompt context keeps the model anchored to existing elements. (d) Builder deduplication by ID prevents element fragmentation.

### 3. Convergence Failure — ELIMINATED

**Problem**: The chain never reaches a satisfying starting point.

**Mitigation**: **Eliminated by design.** We don't require convergence. The budget runs out, then we optionally synthesize an opening from the world state. The chain is a discovery technique, not a path that needs to reach a destination.

### 4. Multi-Goal Incoherence — MEDIUM risk

**Problem**: Different goals produce contradictory world elements.

**Mitigation**: Shared world state. Every solver/builder call sees all existing elements. Director assesses cross-goal coherence. Interleaved processing (goal-by-goal with shared state) prevents siloed development.

### 5. Element Bloat — MEDIUM risk

**Problem**: Too many world elements overwhelm the user.

**Mitigation**: (a) Builder prompt emphasizes essential elements, not exhaustive extraction. (b) Short IDs enable revision over creation. (c) User deletes freely in review. (d) Director can flag redundant elements.

### 6. Shallow/Cliché Reasoning — MEDIUM risk, hardest to solve

**Problem**: Model takes obvious narrative paths rather than discovering interesting world conditions.

**Mitigation**: (a) Director guidance can push for depth and originality. (b) User can edit guidance manually. (c) Open constraints force the model to explore unexpected territory. (d) This is ultimately a prompt engineering challenge — the solver prompt's quality determines the quality of discovery. (e) Temperature and sampling parameters matter here; some randomness aids exploration.

### 7. Context Window Pressure — LOW risk with mitigations

**Problem**: Accumulating scenes + constraints + world elements + guidance fills the context window.

**Mitigation**: (a) Short chains (5 scenes) keep total volume manageable. (b) `buildCruciblePrefix` is lean — no lorebook, no story text, no ATTG. (c) World elements are compact summaries, not full lorebook entries. (d) 200K context on GLM-4.6 is generous for this workload.

---

## GLM-4.6 Considerations

- **357B MoE, 200K context**: Strong reasoning but potentially inconsistent across very long contexts. MoE routing means different experts activate for different parts of generation — can cause tone/logic shifts.
- **No tool use**: Everything must be in-context. Tagged text format (`[TAG] content`) is the structured output mechanism.
- **Limited optional thinking**: `<think>` blocks available but constrained. All generation params include `stop: ["</think>"]` to prevent runaway thinking.
- **No template support**: Prompt engineering relies on message structure, not model-level templates.
- **Recommended params**: temp 1.0, min_p 0.05 for solver (creative exploration benefits from variance). Slightly lower temp (0.8) for builder and director (more deterministic extraction/assessment).

---

## Implementation Mapping

### Modules

| Module | Files | Role |
|--------|-------|------|
| State | `slices/crucible.ts`, `types.ts` | State shape, reducers, migrations |
| Solver | `crucible-strategy.ts` | Scene generation factory + strategy |
| Builder | `crucible-builder-strategy.ts` | Element extraction factory + strategy |
| Director | `crucible-director-strategy.ts` | Assessment factory + strategy |
| Context | `context-builder.ts` → `buildCruciblePrefix` | Shared message prefix |
| Handlers | `effects/handlers/crucible*.ts` | Stream parsing, state dispatch |
| Effects | `effects.ts` | Pipeline orchestration, request queuing |
| UI | `ui/components/Crucible/` | Panel, sections, cards, views |
| Prompts | `project.yaml` | Configurable prompt templates |

### Changes from Current Implementation

#### Solver Termination (change)
- **Current**: `[OPENER]` tag detection is the primary completion signal. Constraint explosion (3 scenes with net >1 open growth) triggers checkpoint/pause.
- **New**: Scene budget (default 5 per goal) is the primary termination. `[OPENER]` is accepted as early completion if it appears naturally. Constraint explosion triggers a Director assessment, not a failure state — some growth is healthy.

#### Solver Prompting (change)
- **Current**: Framed as "discover the previous scene" with emphasis on temporal coherence and constraint satisfaction.
- **New**: Framed as "explore what earlier dramatic moment reveals about this world." Emphasis shifts from narrative continuity to world discovery. The temporal direction is a creative constraint, not a logical requirement.

#### Director Focus (change)
- **Current**: Assesses temporal coherence, narrative shape, pacing.
- **New**: Assesses **world element inventory** — coherence, richness, cross-goal connections, gaps. Scene-level assessment is secondary. The question is "is this world ready to write in?" not "is this chain logically sound?"

#### Opening Synthesis (new)
- **Current**: Chain is expected to reach Scene 1 / opener.
- **New**: Optional synthesis step after world-building loop. Takes completed world elements + goals, describes the starting situation. Only needed if solver didn't naturally produce an `[OPENER]`.

#### Scene Numbering (change)
- **Current**: Descending from 30 (Scene 30 = climax). Confusing when we don't target Scene 1.
- **New**: Ascending from 1. Scene 1 is the first scene explored (closest to climax). Higher numbers are further back in the timeline. This is less confusing because there's no implied "we need to reach Scene 30."

#### Constraint Stall Detection (adjust)
- **Current**: 3 scenes with net >1 open growth triggers checkpoint.
- **New**: Same detection, but treated as a signal for Director assessment rather than a problem state. The Director decides whether constraint growth is healthy exploration or problematic divergence.

### What Stays the Same

- Direction generation
- Goal generation and starring UX
- Builder element extraction pipeline
- Director reject/taint mechanisms
- World element state model (elements, shortIds, fieldIds)
- Constraint tracking (open/resolved/groundState)
- UI structure and component hierarchy
- Streaming handlers and emoji formatting
- `buildCruciblePrefix` context builder
- `stop: ["</think>"]` + `stripThinkingTags()` pattern
