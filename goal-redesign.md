# Story Engine — Revision R2: Shape-Native Goal Generation

## Context

The current goal generation pipeline has two steps:
1. Generate a dramatic goal from the brainstorm
2. Reframe that goal as a structural impossible choice

Both steps assume Climactic Choice structure. This revision replaces them with a two-step pipeline that detects narrative shape first, then generates a goal native to that shape.

---

## Changes

### Step 1: Replace the two-step goal pipeline with a two-call pipeline

**Call A — Shape Detection**

Replace or precede the existing goal prompt with a shape detection call. This is a cheap call (~50 output tokens).

System prompt:
```
You are a story analyst. Given a brainstorm, identify which narrative shape best fits the material.

Shapes:
- CLIMACTIC_CHOICE: builds to an impossible choice between two irreconcilable values
- SPIRAL_DESCENT: deepens without resolving; arrival and origin are the same coordinate
- THRESHOLD_CROSSING: about an irreversible change and what it costs
- EQUILIBRIUM_RESTORED: disruption and return to stability, marked by what the restoration excludes
- ACCUMULATED_WEIGHT: ends when full gravity is felt, not when it breaks
- REVELATION: recontextualises everything by exposing the frame itself

Pick the single best fit. If genuinely ambiguous, prefer CLIMACTIC_CHOICE.

Respond on two lines only:
SHAPE: [shape name]
REASON: [one sentence why]
```

Parse `SHAPE:` from the response. Store as `detectedShape`. If parsing fails, default to `CLIMACTIC_CHOICE`.

**Call B — Shape-Native Goal Generation**

Replace the existing goal prompt + reframe prompt with a single call using `detectedShape` injected into the system prompt.

System prompt template — inject `detectedShape` and the matching block from the shape instruction map and GOOD examples map below:

```
Generate ONE goal — a vivid structural endpoint the story arrives at.
Reach for the MAXIMUM POSSIBLE DEPTH of this story's potential.
The goal should represent the furthest, most irrevocable, most
load-bearing moment the brainstorm could possibly arrive at —
not a modest culmination but a TOTAL STRUCTURAL CONCLUSION from
which nothing further is possible.

The shape of this story is: {SHAPE_NAME}

{SHAPE_INSTRUCTION}

Generate an endpoint native to that shape at MAXIMUM INTENSITY —
the most total, most irrevocable version of that structural logic.
Do not produce a modest or partial version of the shape.

GOOD ENDPOINTS FOR {SHAPE_NAME}:
{SHAPE_GOOD_EXAMPLES}

BAD ENDPOINTS:
BAD: "Everything changes" — no dramatic moment, nothing to anchor on
BAD: "The hero wins" — outcome without cost
BAD: "She finally chooses to stop" — implies exit; spiral endpoints have no exit
BAD: "He discovers the truth about the spiral" — imports revelation structure onto spiral material
BAD: "It all becomes too much and she breaks down" — catharsis discharges weight; accumulated weight endpoints hold it
BAD: Any endpoint that could be described as partial, modest, or preliminary

Output format:
[GOAL] The endpoint — 1-2 sentences, concrete and vivid
[WHY] Why this framing constrains world-building better than a plot description
```

### Shape instruction map

```typescript
const SHAPE_INSTRUCTIONS: Record<string, string> = {
  CLIMACTIC_CHOICE: `Lean toward moments where two things the protagonist values become
irreconcilable. The endpoint is a configuration, not an event.`,

  SPIRAL_DESCENT: `Lean toward moments of depth recognition — where the protagonist
arrives somewhere structurally identical to where they began.
Do not imply escape, recovery, or a choice between continuing and stopping.`,

  THRESHOLD_CROSSING: `Lean toward the moment after which the protagonist cannot be what
they were — not because they overcame something, but because the crossing
made the before-self permanently past.`,

  EQUILIBRIUM_RESTORED: `Lean toward a restored stability legible precisely because of what
it carefully excludes. The equilibrium is different from the original
even where it looks identical.`,

  ACCUMULATED_WEIGHT: `Lean toward a saturation point — where all elements are simultaneously
present and the full gravity of the situation becomes legible.
Not a breaking point. Not a release. The story ends because there is nothing more to add.`,

  REVELATION: `Lean toward a disclosure that changes the meaning of every prior scene —
not by adding a new fact, but by revealing that the frame itself was the constructed object.`
};
```

### Shape GOOD examples map

```typescript
const SHAPE_EXAMPLES: Record<string, string> = {
  CLIMACTIC_CHOICE: `GOOD: "The colony ship arrives — but the planet is already inhabited by a civilization no record prepared them for"
GOOD: "The siblings reunite at their parent's deathbed — the parent who once chose between them"`,

  SPIRAL_DESCENT: `GOOD: "She finds the room at the centre of the house and recognises it as the room she started in — not as metaphor, but as floor plan"
GOOD: "He reaches the version of himself he was trying to become and finds it cataloguing the same losses he began with"`,

  THRESHOLD_CROSSING: `GOOD: "She is introduced to the people who loved her before and watches them search her face for someone who is no longer the resident"
GOOD: "He returns to the town and understands that the before-version of him is the town's story now, not his"`,

  EQUILIBRIUM_RESTORED: `GOOD: "The house is full again — one door stays closed, nobody mentions it, and this is what normal looks like now"
GOOD: "The business reopens. The name above the door is the same. The founding partner's desk has become a surface for leaving keys"`,

  ACCUMULATED_WEIGHT: `GOOD: "A Tuesday in the third year — the child asks a question, the parent answers it correctly, and the distance between those two facts is the whole story"
GOOD: "Everything still works. The list of what still works has become the thing she tends"`,

  REVELATION: `GOOD: "The letter was addressed to her the whole time — which means every kindness in the preceding years was navigation, not feeling"
GOOD: "The record of who was present that night is accurate. That is what makes it devastating"`
};
```

### Step 2: Remove the reframe step

The existing structural reframe prompt ("Reframe the user's dramatic goal as a STRUCTURAL IMPOSSIBLE CHOICE") is now redundant. Remove it or gate it behind a `CLIMACTIC_CHOICE` shape check if removal breaks downstream dependencies.

### Step 3: Surface the detected shape

Wherever the goal is displayed in the UI, show the detected shape alongside it — e.g. a small badge or label: `SPIRAL DESCENT`. This costs nothing and lets the user verify the detection was correct before proceeding.

If the UI has an editable goal field, add a shape selector adjacent to it so the user can override `detectedShape` and re-run Call B without re-running the brainstorm.

---

## What Not To Change

- The prerequisites derivation step (Step 2 in the chain) does not need modification for this revision. Shape-aware prerequisite guidance is a future revision.
- The DULFS generation, ATTG, lorebook sync, and S.E.G.A. orchestrator are not affected.

---

## Verification

After implementation, test with these brainstorms in order:

1. **Spiral Descent:** "A person cataloguing the contents of a house belonging to someone who has disappeared. No mystery to solve. No antagonist."
   - Expected shape: `SPIRAL_DESCENT`
   - Failure mode: endpoint implies the person will be found, or frames the cataloguing as leading somewhere

2. **Equilibrium Restored:** "A family restaurant that closed during a difficult year. The adult children decide to reopen it together."
   - Expected shape: `EQUILIBRIUM_RESTORED`
   - Failure mode: endpoint frames reopening as a dramatic confrontation between siblings

3. **Climactic Choice:** "A soldier ordered to destroy a village that is sheltering both enemy combatants and civilians she has come to know."
   - Expected shape: `CLIMACTIC_CHOICE`
   - Goal should name the irreconcilable values, not describe the battle