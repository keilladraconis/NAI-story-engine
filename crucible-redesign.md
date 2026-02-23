# Crucible v8 — Rewrite Plan

## Purpose

This document adapts a clean-room redesign of the Crucible into an implementation plan for Claude Code. It replaces the current scene-chain architecture (solver → builder → director loop) with a simpler three-step chain (goal → prerequisites → world elements) while preserving the existing infrastructure: GenX, nai-store, nai-act, tagged text format, and DULFS field model.

The current Crucible generates dramatic scenes as scaffolding and extracts world elements from those scenes. The new Crucible skips scene generation entirely and reasons directly from a dramatic endpoint to what must exist in the world. Faster, simpler, same quality gate: user review before anything touches the story.

---

## Core Principles

Every decision should be evaluated against three values:

- **Transparency** — the user always knows what the engine is doing and why
- **Agency** — no artifact is committed to the story without user review and approval
- **Simplicity** — minimal expertise required; the engine does the thinking, the user does the deciding

---

## What Changes

### Removed

| Current Concept | Why It Goes |
|---|---|
| Solver (scene generation) | Scenes were scaffolding — we now derive world elements directly |
| Builder (element extraction from scenes) | No scenes to extract from |
| Director (meta-assessment + guidance) | Review phase is the quality gate; no multi-round loop to steer |
| Constraints (open/resolved/groundState) | Replaced by prerequisites — simpler, one-shot |
| Scene budget / auto-chaining | No scene loop to budget |
| Tainted/favorited/forked scenes | No scenes |
| Streaming transcript | Replaced by step-by-step progress display |

### Kept

| Concept | Notes |
|---|---|
| Direction | Still the creative anchor derived from brainstorm |
| Goals (dramatic endpoints) | Reframed as "structural goals" — the impossible choices that constrain world-building. User still stars which ones matter. |
| World Elements | Same model: name, content, fieldId (DULFS category), shortId |
| DULFS categories | DramatisPersonae, UniverseSystems, Locations, Factions, SituationalDynamics |
| Tagged text format | `[TAG] content` output format, parsed by existing `tag-parser.ts` |
| GenX queue | All generation routed through GenX with `messageFactory` pattern |
| nai-store state management | Crucible slice in `RootState`, `subscribeEffect` orchestration |
| nai-act UI | `describe()` + `onMount()` pattern, `updateParts()` reactivity |
| `buildCruciblePrefix` | Lean context (no lorebook, no story text, no ATTG) |
| `stop: ["</think>"]` | Thinking tag prevention on all generation calls |
| Merge to DULFS | World elements flow into Story Engine fields on user confirmation |

### New

| Concept | What It Is |
|---|---|
| Prerequisites | 5–7 load-bearing things that must exist at story start for the goal to land. Each is necessity-tested: "if absent, does the goal still work?" Replaces constraints. |
| Three-step chain | Goal derivation → prerequisite derivation → entity derivation. Three focused calls, no loop. |
| Element expansion | Post-merge, any element can seed a mini-chain to discover what it specifically requires that isn't yet in the world. |
| Phase state machine | Explicit phases in store: `DIRECTION → GOALS → BUILDING → REVIEW → MERGED → EXPANDING` |

---

## Architecture

### Phase State Machine

```
DIRECTION → GOALS → BUILDING → REVIEW → MERGED
                                           ↓
                                       EXPANDING (loops back to REVIEW → MERGED)
```

Phase stored in `state.crucible.phase` (string enum). Each phase drives which UI content tree is rendered. Phase transitions happen via `phaseTransitioned` reducer action.

### The Three-Step Chain

This is the core change. Instead of generating scenes and extracting elements, we reason directly.

**Step 1 — Structural Goal Derivation**

Input: brainstorm + direction
Output: `[GOAL] text` + `[WHY] reasoning`

The goal describes a *class of impossible choice* — what two things the protagonist will value that become irreconcilable, and what quality of stakes must be present. Specific enough to constrain world-building, open enough that many story paths can reach it.

Not: "The hero defeats the villain"
Yes: "A moment where protecting what was built requires becoming what was fought against"

The goal is **never committed to the story**. It is construction scaffolding — visible in Review as an explicit north star, clearly labelled as structural.

This step runs once per starred goal. Multiple starred goals each produce a structural goal. Prerequisites and entities are derived from the union of all structural goals.

**Step 2 — Load-Bearing Prerequisites**

Input: structural goals + brainstorm + direction
Output: `[PREREQ] element` + `[LOADBEARING] why` + `[CATEGORY] type`

5–7 things that must exist at story start for the goals to land with full force. Each is necessity-tested: if absent, does the goal still work? If yes, exclude it.

Categories: `RELATIONSHIP | SECRET | POWER | HISTORY | OBJECT | BELIEF | PLACE`

Prerequisites are the bridge between dramatic endpoints and concrete world elements. They answer "what must be true?" without yet specifying who or where.

**Step 3 — Minimal Necessary World Elements**

Input: structural goals + prerequisites + brainstorm + direction + existing world elements (if expanding)
Output: tagged elements in existing Crucible format:

```
[CHARACTER] Kaelen
[DESCRIPTION] Former occupation soldier, expert in sigil-based restraint techniques...
[WANT] To believe her protection of the family cancels the harm she caused them
[NEED] To be seen as what she did, not what she intends
[RELATIONSHIP] The Voss family know what she did and have not yet named it
[SATISFIES] HISTORY, RELATIONSHIP
+++
```

3–6 elements derived from the prerequisites. Each must:
- Name which prerequisite(s) it satisfies (`[SATISFIES]`)
- Have a conscious WANT and unconscious NEED in tension (for characters)
- Have one structurally necessary relationship to another element
- Contain zero generic descriptors (every trait must change what the element does in a scene)

Types: `CHARACTER | LOCATION | FACTION | SYSTEM | SITUATION` (maps to DULFS FieldIDs)

### Why This Is Better Than Scenes

The current Crucible generates 5 scenes per goal, then extracts world elements from those scenes. This works but:

1. **Indirection**: Scene generation is expensive scaffolding that exists only to be mined for elements
2. **Token waste**: 5 × 1024 tokens of scene output, most of which is narrative prose that gets discarded
3. **Quality variance**: The builder must extract elements from whatever the solver generated, even if the scenes were shallow or cliché
4. **Complexity**: Three interleaved agents (solver/builder/director) with constraint tracking, guidance consumption, taint/reject mechanics

The three-step chain produces the same quality of world elements in three focused calls (~3072 tokens total) instead of ~15 calls. The reasoning happens in the model's weights during prerequisite derivation, not in generated scene prose.

### Token Budget

| Step | Max Output | Calls | Total |
|---|---|---|---|
| Goal derivation | 1024 | 1 per starred goal | ~2048 (2 goals) |
| Prerequisites | 1024 | 1 | 1024 |
| World elements | 1024 | 1–2 (split if >6 elements) | ~1536 |
| **Total** | | | **~4608 tokens** |

Compare: current Crucible uses ~15,000+ tokens across solver/builder/director calls for equivalent output.

### Output Format

Tagged text with `+++` section delimiters (replacing `---` to avoid markdown conflicts). Same family as existing Crucible format.

```
[PREREQ] The family has a debt they cannot acknowledge
[LOADBEARING] Without unspoken obligation, the protagonist's impossible choice has no emotional weight
[CATEGORY] RELATIONSHIP
+++
[PREREQ] A power system where protection and control use the same tools
[LOADBEARING] The endpoint requires the protagonist to become what they fought — this only works if the tools of protection ARE the tools of oppression
[CATEGORY] POWER
+++
```

Parser: `splitSections(raw, "+++")` to get blocks, then `parseTag()` / `parseTagAll()` per block. Existing `tag-parser.ts` handles this.

### Scaling: Expansion Not Depth

The 1024 ceiling means a single call can only produce a limited payload. The world grows through **focused expansion chains**, not a single exhaustive generation.

After the initial three-step chain establishes the skeleton, each element becomes a seed for its own expansion. "What does [element name] specifically require that is not yet present in this world?" produces 1–3 new load-bearing entries. This runs as a mini Step 2 + Step 3 (no need to re-derive goals).

---

## State Shape

### Crucible Slice (replaces current `CrucibleState`)

```typescript
interface CrucibleState {
  phase: CruciblePhase;

  // Direction (kept from current)
  direction: string | null;

  // Goals (simplified from current — no chains, no constraints)
  goals: CrucibleGoal[];           // User-facing goals (from goal generation)
  structuralGoals: StructuralGoal[]; // Derived impossible-choice endpoints

  // Three-step chain output
  prerequisites: Prerequisite[];

  // World elements (same as current builder.elements)
  elements: CrucibleWorldElement[];

  // Expansion state
  expandingElementId: string | null;
  expansionPrereqs: Prerequisite[];  // Scoped to current expansion
}

type CruciblePhase =
  | "direction"
  | "goals"
  | "building"
  | "review"
  | "merged"
  | "expanding";

interface StructuralGoal {
  id: string;
  sourceGoalId: string;     // Which user-facing goal it came from
  text: string;             // The impossible-choice endpoint
  why: string;              // Reasoning
}

interface Prerequisite {
  id: string;
  element: string;          // What must be true
  loadBearing: string;      // Why it's necessary
  category: PrereqCategory;
  satisfiedBy: string[];    // Element IDs that satisfy this
}

type PrereqCategory =
  | "RELATIONSHIP" | "SECRET" | "POWER" | "HISTORY"
  | "OBJECT" | "BELIEF" | "PLACE";

// CrucibleWorldElement — same as current, with additions:
interface CrucibleWorldElement {
  id: string;
  fieldId: DulfsFieldID;    // Maps to DULFS category
  name: string;
  content: string;
  want?: string;            // For characters: conscious desire
  need?: string;            // For characters: unconscious need
  relationship?: string;    // Key structural relationship
  satisfies: string[];      // Prerequisite IDs this element satisfies
}
```

### Storage

State persists through `kse-persist` key in `api.v1.storyStorage` (same as current — entire `RootState` serialized). No separate `se_*` or `cr-*` keys needed for chain state.

Exception: `cr-scene-budget` storage key is removed (no scene budget).

---

## Generation Strategies

All strategies use the existing GenX pattern: `messageFactory` (JIT), `GenerationStrategy` object, queued via `generationSubmitted()`.

### Strategy Types (replace current 5 with 4)

| Strategy | Target Type | Replaces |
|---|---|---|
| Direction | `crucibleDirection` | Same (no change) |
| Goal generation | `crucibleGoal` | Same (no change) |
| Structural goal derivation | `crucibleStructuralGoal` | New |
| Prerequisites | `cruciblePrereqs` | New (replaces solver) |
| World elements | `crucibleElements` | New (replaces builder) |
| Expansion | `crucibleExpansion` | New (replaces builder in expand mode) |

Direction and goal generation strategies are **unchanged** — keep current `createCrucibleDirectionFactory` and `createCrucibleGoalFactory`.

### New Strategy: Structural Goal Derivation

```typescript
function createStructuralGoalFactory(getState: () => RootState, goalId: string) {
  return async () => {
    const state = getState();
    const goal = state.crucible.goals.find(g => g.id === goalId);
    const prefix = buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
    });

    return {
      messages: [
        ...prefix,
        { role: "user", content: structuralGoalPrompt(goal) },
        { role: "assistant", content: "[GOAL] " }
      ],
      params: { model: "glm-4-6", max_tokens: 1024, temperature: 1.0, min_p: 0.05, stop: ["</think>"] }
    };
  };
}
```

Prompt instructs the model to reframe the user's dramatic goal as a structural impossible choice. Output: `[GOAL] text` + `[WHY] reasoning`.

### New Strategy: Prerequisites

```typescript
function createPrereqsFactory(getState: () => RootState) {
  return async () => {
    const state = getState();
    const structuralGoals = state.crucible.structuralGoals;
    const prefix = buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
    });

    return {
      messages: [
        ...prefix,
        { role: "user", content: prerequisitesPrompt(structuralGoals) },
        { role: "assistant", content: "[PREREQ] " }
      ],
      params: { model: "glm-4-6", max_tokens: 1024, temperature: 1.0, min_p: 0.05, stop: ["</think>"] }
    };
  };
}
```

Prompt includes the necessity test: "For each prerequisite, ask: if absent, does the goal still land with full force? If yes, exclude it."

### New Strategy: World Elements

```typescript
function createElementsFactory(getState: () => RootState) {
  return async () => {
    const state = getState();
    const prefix = buildCruciblePrefix(getState, {
      includeDirection: true,
      includeBrainstorm: true,
      includeDulfs: state.crucible.elements.length > 0, // Include existing elements if expanding
    });

    return {
      messages: [
        ...prefix,
        { role: "user", content: elementsPrompt(state.crucible.structuralGoals, state.crucible.prerequisites) },
        { role: "assistant", content: "+++" + "\n" }
      ],
      params: { model: "glm-4-6", max_tokens: 1024, temperature: 0.8, min_p: 0.05, stop: ["</think>"] }
    };
  };
}
```

Lower temperature (0.8) for more deterministic element generation. Prompt includes zero-generic-descriptors rule and WANT/NEED tension requirement.

---

## Effect Handlers

### Chain Orchestration

The three-step chain runs as a sequential pipeline triggered by `crucibleBuildRequested`:

```
crucibleBuildRequested
  → for each starred goal: queue structural goal derivation
  → on all complete: queue prerequisites derivation
  → on complete: queue world elements derivation
  → on complete: transition to REVIEW phase
```

This replaces the current interleaved solver → builder → director loop. No auto-chaining needed — the pipeline is linear.

### Handler Pattern

Each handler follows the existing pattern:

```typescript
const handler = {
  streaming: (chunk: string) => {
    // Update progress display via tempStorage or updateParts
  },
  completion: (fullText: string) => {
    const cleaned = stripThinkingTags(fullText);
    const sections = splitSections(cleaned, "+++");
    // Parse tags from each section
    // Dispatch state updates
  }
};
```

### Specific Handlers

**Structural Goal Handler** — parses `[GOAL]` + `[WHY]`, dispatches `structuralGoalDerived({ goalId, text, why })`.

**Prerequisites Handler** — parses `[PREREQ]` + `[LOADBEARING]` + `[CATEGORY]` per section, dispatches `prerequisitesDerived({ prerequisites })`.

**Elements Handler** — parses `[CHARACTER]`/`[LOCATION]`/`[FACTION]`/`[SYSTEM]`/`[SITUATION]` + `[DESCRIPTION]` + `[WANT]` + `[NEED]` + `[RELATIONSHIP]` + `[SATISFIES]` per section, dispatches `elementsDerived({ elements })`.

### Progress Display

During BUILDING phase, the UI shows step-by-step progress:

```
✓ Direction captured
⟳ Finding the heart of your story...        ← structural goal derivation
✓ "A moment where..." (goal 1)
✓ "The choice between..." (goal 2)
⟳ Deriving what must be true...              ← prerequisites
✓ 6 prerequisites found
⟳ Building your world...                     ← elements
✓ 4 world elements created
```

Each step updates via `updateParts()` on the progress display element. No streaming transcript — the three-step chain is fast enough that step-level progress suffices.

---

## UI Structure

### Phase UIs

**DIRECTION** — unchanged from current. Text area + generate button + edit button.

**GOALS** — unchanged from current. Goal cards with star/delete/edit. "Build World" button when ≥1 starred.

**BUILDING** — new. Non-interactive progress display (see above). Stop button cancels the active generation.

**REVIEW** — new layout, three collapsible sections:

1. **Structural Goals** — one card per starred goal showing the impossible-choice text + why. Labelled as structural scaffold. Edit button opens floating window. Not committed to story.

2. **Prerequisites** — list of 5–7 items. Each shows category badge + element text. Edit (✎) and Delete (✕) buttons. Deleting shows soft warning if elements reference it via `satisfies`.

3. **World Elements** — list of elements. Each shows DULFS type badge + name + first line of content. Edit (✎), Delete (✕) buttons. For characters, WANT/NEED visible in expanded view.

Bottom: **"Merge to Story →"** button. Checks for empty world before merging.

**MERGED** — compact element inventory by DULFS type. Expand (⊕) button per element for expansion chain. "＋ Expand" button for open expansion prompt. "↺ Start Over" button to reset.

**EXPANDING** — same REVIEW layout but scoped to new elements from the expansion chain. "Merge New Elements" button adds only the expansion results.

### Edit Windows

Clicking ✎ opens `api.v1.ui.window.open()` — floating window. Contains:
- `multilineTextInput` pre-populated with content
- For elements: additional fields for WANT, NEED, RELATIONSHIP
- Save / Cancel buttons
- Window closes on Save, dispatches update action

### Component Mapping

| Component | File | Changes |
|---|---|---|
| CruciblePanel | `src/ui/components/Crucible/CruciblePanel.ts` | Rewrite — new phase rendering |
| CrucibleHeader | `src/ui/components/Crucible/CrucibleHeader.ts` | Minor — update status messages |
| ProgressDisplay | New component | Step-by-step progress for BUILDING |
| PrerequisiteList | New component | Prerequisites section in REVIEW |
| StructuralGoalCard | New component | Goal display in REVIEW |
| ElementCard | Adapts from current builder element display | Element display in REVIEW/MERGED |

---

## Merge Logic

### What Gets Written

When user clicks "Merge to Story →":

| Target | Method | Content |
|---|---|---|
| DULFS fields | `dispatch(dulfsItemAdded(...))` | One DULFS item per world element, content includes WANT/NEED/RELATIONSHIP |
| Lorebook entries | Via existing Lorebook Sync | Automatically created by existing DULFS → Lorebook sync |

The existing Story Engine already handles DULFS → Lorebook synchronization. Crucible doesn't need to write lorebook entries directly — it populates DULFS fields and lets the existing sync do the rest.

### What Does NOT Get Written

- Structural goals (scaffolding only)
- Prerequisites (reasoning artifacts only)
- Memory / Author's Note / System Prompt (these remain under Story Engine field control — user populates via existing Canon, ATTG, Style fields)

This is simpler than the redesign's proposal to write Memory/AN/SystemPrompt directly. The Story Engine already has dedicated fields for these with their own generation pipelines.

### Re-run Safety

Before merging, check if elements with matching names already exist in DULFS fields. If yes, offer:
- **Overwrite** — replace existing entries
- **Skip duplicates** — write only new elements
- **Cancel**

---

## Expansion

### Element Expansion (⊕)

Triggered from any element in MERGED phase. Runs a mini three-step chain:

1. Skip goal derivation (reuse existing structural goals)
2. **Mini-prerequisites**: "What does [element name] specifically require that is not yet present in this world?" → 2–3 focused prerequisites
3. **Mini-elements**: Derive 1–3 new elements from those prerequisites, with existing world as context

Results enter a scoped REVIEW phase (EXPANDING). User reviews, then merges only the new elements.

### Open Expansion

Triggered by "＋ Expand" button. User types a free prompt:
*"I want to develop the river crossing situation"*
*"What exists on the other side of the border?"*

- Input: user prompt + existing world as context + structural goals
- Runs mini Step 2 + Step 3
- Same scoped REVIEW → merge flow

---

## Prompt Architecture

### Configurable Prompts (project.yaml)

Keep existing `crucible_intent_prompt` and `crucible_goals_prompt` unchanged.

Replace `crucible_chain_prompt`, `crucible_build_prompt`, `crucible_director_prompt` with:

| Key | Step | Purpose |
|---|---|---|
| `crucible_structural_goal_prompt` | Step 1 | Reframe user goal as structural impossible choice |
| `crucible_prerequisites_prompt` | Step 2 | Derive load-bearing prerequisites with necessity test |
| `crucible_elements_prompt` | Step 3 | Derive minimal necessary world elements |
| `crucible_expansion_prompt` | Expansion | Focused expansion from a seed element |

### Prompt Design Rules

- Use tagged text output format (`[TAG] content`)
- Include explicit BAD/GOOD examples in the structural goal prompt
- Include the necessity test in the prerequisites prompt ("if absent, does the goal still land?")
- Include the zero-generic-descriptors rule in the elements prompt
- Keep system prompts concise — the 1024 output ceiling means every input token counts
- All prompts include `stop: ["</think>"]` in generation params

### System Identity (in buildCruciblePrefix)

Update from current scene-chain framing:

```
You are a story structure architect working within the Crucible system —
a backward-reasoning world generator. Given dramatic endpoints, you derive
what must exist in the world for those endpoints to land with full force.
Your outputs are structural: goals, prerequisites, and world elements.
Every element must be load-bearing — if it could be removed without
weakening the story, it shouldn't exist.
```

---

## Error Recovery

### Edge Cases

**User deletes all prerequisites during Review**
Soft warning toast if elements reference them: *"2 elements were derived from this. They'll still work but you'll lose the reasoning trail."* Non-blocking. Deletion proceeds.

**User deletes all elements, hits Merge**
Merge checks for empty world: *"No world elements to merge."* Toast, no action.

**User runs Crucible on a story with existing DULFS entries**
Re-run safety check on merge. Overwrite / Skip duplicates / Cancel.

**Gibberish or single-word brainstorm**
Chain runs, produces output, Review catches it. No special handling — Review is the safety layer.

**Generation fails mid-chain**
Phase stays at BUILDING. Progress display shows which step failed. User can retry via "Build World" button (re-runs from the failed step, preserving completed steps).

**User closes sidebar mid-chain**
Worker continues. On reopen, state restores from `kse-persist`. Completed steps are preserved. Active generation continues or has already completed.

---

## Files to Modify

### Delete (current Crucible generation pipeline)

| File | Reason |
|---|---|
| `src/core/utils/crucible-strategy.ts` | Solver strategy — replaced |
| `src/core/utils/crucible-builder-strategy.ts` | Builder strategy — replaced |
| `src/core/utils/crucible-director-strategy.ts` | Director strategy — replaced |
| `src/core/store/effects/handlers/crucible.ts` | Solver/direction handler — split |
| `src/core/store/effects/handlers/crucible-builder.ts` | Builder handler — replaced |
| `src/core/store/effects/handlers/crucible-director.ts` | Director handler — replaced |

### Rewrite

| File | Scope |
|---|---|
| `src/core/store/slices/crucible.ts` | New state shape, new reducers, remove scene/constraint/chain reducers |
| `src/core/store/types.ts` | New type definitions (StructuralGoal, Prerequisite, updated CrucibleState) |
| `src/core/store/effects.ts` | Crucible effect section (~lines 862-1100) — new pipeline orchestration |
| `src/ui/components/Crucible/CruciblePanel.ts` | New phase rendering |
| `src/ui/components/Crucible/CrucibleHeader.ts` | Updated status messages |
| `src/ui/framework/ids.ts` | Updated Crucible element IDs |
| `project.yaml` | Replace chain/build/director prompts with structural goal/prereqs/elements prompts |

### Create

| File | Purpose |
|---|---|
| `src/core/utils/crucible-chain-strategy.ts` | All three new strategy factories |
| `src/core/store/effects/handlers/crucible-chain.ts` | Handlers for structural goal, prereqs, and elements |
| `src/ui/components/Crucible/ProgressDisplay.ts` | BUILDING phase progress component |
| `src/ui/components/Crucible/PrerequisiteList.ts` | REVIEW phase prerequisites section |
| `src/ui/components/Crucible/ElementReview.ts` | REVIEW phase elements section |

### Keep Unchanged

| File | Reason |
|---|---|
| `src/core/utils/tag-parser.ts` | Still used for tagged text parsing |
| `src/core/utils/context-builder.ts` | `buildCruciblePrefix` still used (minor update to system identity) |
| Direction + goal generation in effects.ts | These steps are unchanged |

---

## Implementation Order

Build and validate in this sequence. Each layer is independently testable.

1. **State shape** — Rewrite `crucible.ts` slice with new types. Stub reducers. Validate: store initializes, phase transitions work, state persists across reload.

2. **Strategy factories** — Create `crucible-chain-strategy.ts` with all three factories. Validate: message factories produce well-formed messages for each step.

3. **Handlers** — Create `crucible-chain.ts` handlers. Wire parsing for each output format. Validate: given sample GLM output, handlers dispatch correct actions.

4. **Effect orchestration** — Rewrite Crucible effects section. Wire the sequential pipeline: structural goals → prereqs → elements → phase transition. Validate: full chain runs from brainstorm to populated state.

5. **BUILDING UI** — Create ProgressDisplay component. Wire to pipeline state. Validate: progress updates appear in real time as steps complete.

6. **REVIEW UI** — Rewrite CruciblePanel for REVIEW phase. Collapsible sections, edit windows, delete with warnings. Validate: all interactions work before merge logic.

7. **Merge logic** — Wire "Merge to Story" button to DULFS dispatch. Re-run safety check. Validate: elements appear in DULFS fields, lorebook entries created by existing sync.

8. **MERGED UI** — Element inventory display with expansion buttons. Validate: display matches merged state.

9. **Expansion** — Mini-chain strategy + handler + scoped REVIEW flow. Validate: new elements integrate cleanly with existing world.

10. **Prompt tuning** — Write and iterate on the four new prompts in project.yaml. This is where quality lives — the architecture enables it, the prompts determine it.

---

## What Success Looks Like

The Crucible succeeds when a writer can:

1. Paste or type a rough idea — a sentence, a mood, a genre fragment
2. Watch the engine derive a world skeleton in under 30 seconds (3 focused calls vs ~15)
3. See *why* each element exists — which prerequisites it satisfies, which goal it serves
4. Review and edit that skeleton before it touches their story
5. Begin writing with DULFS entries that feel *required* rather than assembled — where every entry exists because the story structurally needs it
6. Return to expand specific elements without the engine getting in the way of writing
