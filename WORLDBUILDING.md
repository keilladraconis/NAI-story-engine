# Story Engine — Output Quality Improvement Plan

Source: *The Craft of World-Building and Writing* by OccultSage (Wes Brown),
cross-referenced against Story Engine's generation pipeline and prompts.

This document captures structural gaps and prompt-level improvements to work through.
Update it as items are completed.

---

## Pipeline Overview (current)

```
Brainstorm → ATTG + Style
                ↓
      Foundation (Crucible/Forge):
        Shape → Intent → World State → Tensions
                ↓
      DULFS Lorebook Entities:
        Characters / Systems / Locations / Factions
        Narrative Vectors / Topics
                ↓
      Bootstrap (opening prose)
```

**Orphaned features** (wired in backend, zero UI — data always empty):

- **Canon** (`FieldID.Canon`) — no UI to view/edit/generate. Referenced in
  `context-builder.ts` (prefix MSG 2), `lorebook-strategy.ts` (crucible
  context), and `bootstrap.ts`, but always empty. Its intended role — bedrock
  world facts — overlaps with Foundation's Intent + World State and the new
  Story Contract field (GAP 2 below).

- **Foundation Tensions** (`state.foundation.tensions`) — slice has full CRUD
  actions (`tensionAdded`, `tensionEdited`, `tensionResolved`, `tensionDeleted`,
  `tensionGenerationRequested`), effects in `foundation-effects.ts`, strategy
  builder, prompt (`CRUCIBLE_TENSIONS_PROMPT`), and ID constants in `ids.ts` —
  but no UI component renders or dispatches any of it. Also injected into the
  SE prefix (context-builder.ts:371) and crucible prefix (:515), reading
  from always-empty state.

Both should be removed from active pipeline references as prerequisite cleanup
before adding Intensity and Contract fields to Foundation.

---

## Structural Gaps

These are missing concepts or passes in the pipeline itself — not just prompt wording.

---

### GAP 1 — Intensity field (highest priority)

**What's missing:**
The guide's single most foundational decision: *how much pressure does this story operate under?*
A five-level spectrum from Cozy to Nightmare that shapes everything downstream.

| Level | Hope | Walk away? | Antagonism | Victory cost |
|---|---|---|---|---|
| Cozy | Unconditional | Always | None or circumstantial | Effort, awkwardness |
| Gentle | Dominant | Yes | Misguided, not malicious | Some setbacks |
| Moderate | Present | At cost | Genuine opposition | Real trade-offs |
| Intense | Earned | Rarely | System with hooks in everyone | Sacrifice, permanent change |
| Nightmare | Unwarranted | No | Actively hostile system | Pyrrhic at best |

**Why it matters:**
Without this, every downstream generation silently guesses the stakes level. A
Moderate character history in a Nightmare story. A Gentle complication in an
Intense Narrative Vector. The model calibrates to genre convention by default,
which is rarely exactly right.

**Implementation:**
- Add `intensity` field to `FoundationState` (structured: `{ level: string; description: string } | null`)
- Generate alongside Shape (can be user-set or derived from brainstorm material)
- Inject early in the context prefix — before other Foundation fields — so all downstream generation is calibrated
- The description should spell out what intensity means *for this specific story*, not just name the level

**Where it improves things automatically (no other changes needed):**
Character depth and darkness, Narrative Vector stakes, Location atmosphere,
Bootstrap emotional register, Forge element descriptions.

---

### GAP 2 — Story Contract (Foundation field)

**What's missing:**
The guide's "Clarifying What You're Writing" produces a working document with:
- **Required elements** — what must appear (concrete things: the setting, the scenario, the relationship configurations)
- **Prohibited elements** — what would break this story (e.g. "no deaths, no betrayals" for cozy; "no safe resolutions" for nightmare)
- **Emphasis** — what's foregrounded (found family? the mystery? the power struggle?)
- **Implicit constraints** — what the genre promise entails

**Why it matters:**
There's no way to tell the model "don't generate character deaths in this cozy
story" or "don't generate hopeful resolutions in this nightmare world." Style
carries prose voice. ATTG carries genre metadata. Neither carries *what's off
the table*.

**Implementation:**
A `contract` text field in `FoundationState`, with a generation prompt that
synthesizes required/prohibited/emphasis from brainstorm + intensity + ATTG.

This must be its own Foundation field, not a Canon extension. The Story Contract
is meta — it's about the story's relationship to the reader and the author's
creative commitments. It doesn't describe *what's true about the world*; it
describes *what kinds of things this story allows and forbids*. Conflating the
two makes both harder to generate cleanly and harder to reason about.

Injected into the prefix as its own labeled section `[STORY CONTRACT]`, after
Intensity and before other Foundation fields.

**Prerequisite:** Remove orphaned Canon and Foundation Tensions from the pipeline.
The Contract field absorbs some of Canon's intended purpose (anchoring generation)
but with a different, more precise scope. Foundation Tensions overlap conceptually
with Narrative Vectors (DULFS) and with the Intensity field's implications —
they should be cleaned out rather than resurrected.

**Generation prompt sketch:**
```
Given the brainstorm material, intensity level, and genre above, produce a
Story Contract — the author's commitments for this story.

**Required:** What must appear — concrete elements, not themes. The setting,
the scenario, the relationship configurations, the specific ingredients the
author has committed to.

**Prohibited:** What would break this story. Content, tonal choices, and
narrative moves that are incompatible with the intensity level and genre
promise. Be specific: not "nothing too dark" but "no character deaths, no
betrayals, no permanent relationship destruction."

**Emphasis:** What the story foregrounds — where the narrative spends its
attention and energy. If the story emphasizes found family dynamics, say so.
If it emphasizes the mystery, say so. This tells downstream generation where
to invest detail and where to keep things light.

**Implicit constraints:** What the genre and intensity promise even if the
author hasn't said it explicitly. A cozy story implicitly promises the absence
of malice. A nightmare story implicitly promises that hope is not guaranteed.

Dense prose, ~150-200 words. No preamble.
```

---

### GAP 3 — Narrative Vectors: conditions vs. forced choices + ensemble synthesis

**Two problems, one solution:**

**Problem 1 — Template structure.**
SE's Narrative Vectors describe *conditions* that generate pressure. The guide's
Plot Situations are **detonation points** — specific collision moments where
characters face impossible choices.

Narrative Vector: *"An apprentice's blind loyalty to a mentor whose methods
have grown ruthless"* — a condition.

Plot Situation (guide format): *`Setup; complication that prevents easy
resolution and forces a choice`* — a forced choice where every option costs
something.

The guide also organizes situations by **domain** (e.g., "Bond Stress / Duty vs.
Conscience / Power & Hierarchy") to ensure coverage across different aspects of
characters' lives, not twenty variations of the same conflict type.

The guide's framing principle: **opposing goods, not good vs. evil.** The
strongest tensions have legitimate competing claims on both sides.

**Problem 2 — Ensemble synthesis.**
SE generates individual lorebook entries but has no pass that produces the
collision points where character secrets meet situations. The guide calls this
the **ensemble map**:

> *"Water recycling fails; the engineer knows her estranged son sabotaged it,
> while the council representative is watching for any sign of cover-up — she
> must choose between her child and the ship."*

This synthesizes: character A's secret + character B's goal + situation =
specific impossible position. The guide maps three dimensions:
- **Resource dependencies** — who needs what from whom (leverage that constrains behavior)
- **Secret intersections** — where one character's action might inadvertently expose another
- **Historical echoes** — past events distributed unevenly across the cast (some know, some don't)

**Why these are the same problem:**
The ensemble synthesis output is structurally identical to a Narrative Vector —
actors, a situation, competing pressures, activation keys (the character names).
It doesn't need a separate Foundation field or a new artifact type. It needs a
**smarter NV generation strategy** that reads the full cast and targets their
intersections.

First-pass NV generation produces the obvious dynamics ("the power struggle
between X and Y"). A synthesis pass produces the non-obvious collision points
("when X's secret intersects Y's goal in situation Z, both are trapped").
Both produce lorebook entries that activate via character-name keys during
story writing — no new delivery mechanism needed.

**Why it matters:**
Narrative Vectors as currently designed are world-building artifacts. Plot
Situations as the guide describes them are play-generating pressure points.
Worlds with explicit collision points feel *inevitable*; worlds without them
feel like a collection of pieces occupying the same setting.

**Implementation — template:**
- Update `LOREBOOK_TEMPLATE_DYNAMIC` to use Setup + Complication structure
- The Actors section should note: what makes resolution impossible for each actor, not just "their role in the dynamic"
- Add framing note to `LOREBOOK_GENERATE_PROMPT`: "Frame tensions as opposing goods — both sides have legitimate claims"
- Consider whether the one-line `SituationalDynamics` generation instruction should shift to `Setup; complication` format

**Implementation — ensemble synthesis pass:**
- A second-pass NV generation strategy that runs after Characters exist
- Reads all Character entities (summaries + lorebook text) and existing NVs
- Identifies secret/dependency/history intersections across the cast
- Generates new NV entities with lorebook entries and character-name keys
- Uses the same template and pipeline as regular NV generation — just a smarter prompt

**Revised template target:**
```
[Vector Name]
Type: Narrative Vector
Setting: original
Scope: [Local / Regional / Global]
Situation: [Setup — what is happening and what is at stake. 1-2 sentences.]
Complication: [What prevents easy resolution; why every option costs something. 1-2 sentences.]
Actors:
- [Character]: [What they legitimately need here — and what their position or secret makes impossible.]
- [Character]: [What they legitimately need here — and what their position or secret makes impossible.]
```

---

### GAP 4 — Bootstrap structural underspecification

**What's missing:**
The guide has a 7-paragraph architecture for opening scenes that SE's Bootstrap
doesn't implement:

1. **Sensory grounding** — first breath = air of this place; concrete sensory detail, not "the station was busy"
2. **Protagonist's position** — their NOW (what they're doing, what's at stake in the next few minutes); not backstory
3-4. **Character introductions** — physical detail first, then behavioral tell, then position in space; each character grounded before the next appears
5-6. **Tension builds** — prose style announces itself; the reader calibrates expectations
7. **Forward momentum** — ends in motion (decision point, moment of change, unrealized potential); never resolved

**Opening-specific prohibitions from the guide:**
- No backstory dumps ("She had spent fifteen years climbing the ranks...")
- No philosophical framing ("The nature of power is that it corrupts...")
- No rhetorical questions ("What would the future hold?")
- No "It was" / "There was" constructions
- No weather without function (only if it affects action)
- No premise explanation as narration ("In the three centuries since launch, the generation ship had...")

**Constraint on context passed to Bootstrap:**
The guide says 1 location, 2-4 characters maximum. Currently Bootstrap gets the
full entity context — tempting the model to introduce too many characters and
locations at once.

**Implementation:**
- Rewrite `BOOTSTRAP_PROMPT` (or the bootstrap strategy system prompt) with this architecture
- Add opening-specific prohibitions
- The bootstrap strategy should filter the entity context to a focused subset: 1 primary location, 2-4 characters flagged as "opening cast"

---

### GAP 5 — No revision / critique mode

**What's missing:**
The guide's Quality Check and Skeleton Method are diagnostic tools for generated
prose. SE has no critique pass. The model generates; the user accepts or
rewrites manually with no structural feedback.

**Quality Check items (from the guide):**
- "Not X but Y" phrasing
- Hedging qualifiers (seemed to, appeared to, almost)
- Named emotions in narration
- Appositive modifiers (comma + possessive)
- Voice quality as emotion indicator (her voice dropped to a husky whisper)
- Sensation metaphors (pulse quickened, breath caught, heat pooled)
- Three or more short declarative sentences in sequence
- Feature catalogs (hair → eyes → body)
- Eyes or smiles as primary action
- Abstract movement descriptions (fluid grace, liquid grace)
- Backstory dumps ("had spent [years]...")

**Implementation:**
A new generation mode: "Critique" or "Polish" button on lorebook entries and
bootstrap prose. System prompt: apply the Quality Check checklist and Skeleton
Method pattern vocabulary. Output: specific flagged patterns with rewrite
suggestions, not a full rewrite.

This is lower priority than the structural gaps but would be a genuinely
differentiated feature.

---

## Prompt-Level Fixes

These are wording changes to existing prompts. No new fields or generation
modes required.

---

### FIX A — `LOREBOOK_TEMPLATE_CHARACTER` — Appearance field

**Current:**
```
Appearance: [What a stranger notices first — build, coloring, distinguishing features, how they carry themselves. 2-3 sentences.]
```

**Problem:**
"Build, coloring, distinguishing features" is the catalog trap — hair → eyes →
body in sequence. The guide calls this "a checklist that reads like a form
being filled out." LLMs default to exactly this pattern.

**Target:**
```
Appearance: [What a camera would capture: one thing visible across the room, one thing noticed up close, how they move through or occupy space. No feature lists. 2-3 sentences.]
```

The guide's three-element structure: something you'd see across a room (build,
how they carry themselves) + something you'd notice up close (scar, ink-stained
fingers, worn collar) + something they do without thinking (behavioral habit
as physical action).

---

### FIX B — `LOREBOOK_TEMPLATE_CHARACTER` — Personality field + quote guidance

**Current:**
```
Personality: [How they behave under pressure, what they want, what they hide. Weave in a defining quote. 2-3 sentences.]
```

**Problem 1:** "What they want, what they hide" invites adjective labels
("ambitious," "secretive") instead of observable behavior.

**Problem 2:** "Weave in a defining quote" with no further guidance produces
thesis statements ("In my brokenness I found freedom") — characters explaining
their themes to the audience. The guide is explicit: quotes must reveal through
*what the character notices*, not what they believe about themselves.

**Target:**
```
Personality: [Observable behavior under pressure — what they do, not what they are. No personality adjectives. Include a defining quote: it must reveal character through what they notice or how they speak, not through self-explanation. 2-3 sentences.]
```

**Guide examples of bad vs. good quotes:**
- Bad: *"True intimacy isn't manufactured perfection, but the acceptance of imperfection in ourselves and others."*
- Good: *"You've been watching the door since you sat down. Expecting someone, or just habit? Don't answer — I can tell which it is."*

---

### FIX C — `LOREBOOK_TEMPLATE_LOCATION` — restructure around 3-part pattern

**Current structure:**
```
Atmosphere: [Sensory snapshot — what you see, hear, smell on arrival. 2-3 sentences.]
Description: [What this place is, how it shapes those within it, and what makes it a site of conflict or opportunity. 3-5 sentences.]
```

**Problem:**
The guide's 3-part location formula is: (1) sensory anchor, (2) functional
reality, (3) dramatic potential. The current Atmosphere + Description split
muddles this — "what makes it a site of conflict" is buried inside a catch-all
Description alongside "what this place is" and "how it shapes those within it."

**The guide's concise examples (3 sentences each):**
- *The Bonding Chamber: Obsidian walls amplify psychic resonance. Incense masks the copper scent of blood sigils. Intimacy and violation merge in ritual space.*
- *Commons Cafeteria: Protein paste, social hierarchy on display. Aug and baseline separate by choice. Tension simmers over rations.*

Sentence 1: sensory anchor (what hits you first). Sentence 2: functional
reality (what naturally happens here). Sentence 3: dramatic potential (what
could happen here that couldn't elsewhere).

**Target:**
```
Atmosphere: [What hits you first when you enter — the one or two sensory details that define this space. 1-2 sentences.]
Description: [What naturally happens here; what this place is for and how it shapes the people in it. 2-3 sentences.]
Hook: [What could happen here that couldn't happen elsewhere — the dramatic potential specific to this space. 1 sentence.]
```

---

### FIX D — `LOREBOOK_GENERATE_PROMPT` — add prose prohibition vocabulary

**Current character directive:**
```
Characters: Appearance a camera would capture, personality through behavior not adjectives, and the internal conflict that makes them volatile. Include a defining quote in Personality.
```

**Problem:**
"Personality through behavior not adjectives" is correct intent but too vague.
LLMs default to specific bad patterns the guide names. Naming them explicitly
is much more effective than the abstract directive.

**Target addition (add to Character directive):**
```
Characters: Appearance a camera would capture — specific physical details, not
impressions. Personality through observable behavior, not adjective labels.
Banned: abstract qualities (commanding presence, quiet intensity, nervous
energy), sensation metaphors (heat pooled, pulse quickened), dead metaphors
(moves like a predator), feature catalogs (hair → eyes → body in sequence).
Include a defining quote that reveals through what they notice, not what
they believe.
```

---

### FIX E — `LOREBOOK_TEMPLATE_DYNAMIC` — opposing goods framing

**Current Actors field:**
```
- [Character]: [Their role in this dynamic and why they are in tension with the other actor(s).]
```

**Target:**
```
- [Character]: [What they legitimately need here — and what their position or secret makes impossible.]
```

This shifts the frame from "who is in conflict" (which invites simple
antagonism) to "what competing legitimate needs create an impossible position"
(which is what the guide means by opposing goods).

---

### FIX F — `BRAINSTORM_CRITIC_PROMPT` — add intensity diagnostic

The critic currently diagnoses character texture gaps (Wants vs. Needs,
Surface/Shadow/History). It doesn't ask whether the story's intensity is
consistent or even identified.

**Add to the CHARACTER TEXTURE section:**
```
- **Intensity coherence:** What level of pressure is this story actually operating
  under — cozy, gentle, moderate, intense, or nightmare? Is the story consistent
  about whether hope is warranted, whether characters can walk away, what
  victory costs?
```

---

### FIX G — DULFS one-liner format for Characters

**Current (`field-definitions.ts` exampleFormat):**
```
Name (Gender, Age, Role): Motivation. Behavioral tell.
Example: Kael (Male, 34, Smuggler): Paying off a life debt. Rubs a coin when calculating odds.
```

**Problem:**
The guide's cast list format prioritizes **visual differentiation** at this
stage — two visuals so you can spot redundancy across the ensemble at a glance.
Motivation belongs on the full character sheet (lorebook entry), not the
one-liner.

The DULFS one-liner is what other generations see as context (prefix MSG 3).
If it carries visuals, every downstream generation inherits physical grounding.
If it carries motivation, the model has to invent the visual from scratch
during lorebook generation — and tends to fall into the catalog trap.

**Guide cast list format:**
```
Name (gender, age, role): visual #1, visual #2, behavioral tell
```

**Target:**
```
Name (Gender, Age, Role): Visual across the room. Visual up close. Behavioral tell.
Example: Kael (Male, 34, Smuggler): Lean build, always angled toward the exit. Faded knife scar across the back of one hand. Rubs a coin when calculating odds.
```

Also update the `generationInstruction`:
```
Current: "One line per character: name, demographics, core motivation, and one behavioral tell. Be terse."
Target:  "One line per character: name, demographics, two visuals (one across the room, one up close), and one behavioral tell. Be terse."
```

---

### FIX H — `STYLE_GENERATE_PROMPT` — two tonal guides technique

**Current:**
```
Generate a style guideline for this story.
...
Write in a style that conveys the following: [concise style guidance limit 80 words]
```

**Problem:**
The guide has a specific technique: pick **two authors** whose combined
sensibilities triangulate your target. A single author reference (from ATTG)
tends to dominate — you end up writing pale imitation. Two references create
productive tension that produces something new.

> "Match authors to emotional register and prose style, not surface genre."

Example pairings from the guide:
- Alexander McCall Smith + Jan Karon → cozy small-town ensemble
- Daphne du Maurier + Sarah Waters → gothic mystery with psychological depth
- P.G. Wodehouse + Terry Pratchett → comedy about absurd bureaucracies

**Target:**
```
Generate a style guideline for this story.

INSTRUCTION:
- Begin with a two-author tonal anchor: name two authors whose combined
  sensibilities capture this story's voice. Match to emotional register and
  prose style, not surface genre. The pairing should create productive tension
  (e.g. one author's warmth against another's edge).
- Then describe the resulting voice: sentence rhythm, level of description,
  use of interiority, how prose handles emotion. Limit 80 words total.
- DO NOT use any markdown bolding (**).
- OUTPUT ONLY THE GUIDELINE.
```

---

### FIX I — Forge/Crucible element descriptions

**Current (`CRUCIBLE_BUILD_PASS_PROMPT`):**
```
[CREATE TYPE "Name"]
Description of the element — 2-3 sentences, zero generics.
Every trait must change what the element does in a scene.
```

**Problem:**
"Zero generics" is good intent but unstructured. The guide provides specific
vocabulary for what makes descriptions work. Since Forge creates draft entities
whose descriptions seed later lorebook generation, getting the structure right
here means better material downstream.

**Target (update the CREATE description guidance):**
```
[CREATE CHARACTER "Name"]
Two visuals (across the room, up close) and a behavioral tell.
Every trait must be camera-observable — no abstract qualities,
no personality adjectives.

[CREATE LOCATION "Name"]
Sensory anchor (what hits you first), functional reality (what
happens here), dramatic potential (what could happen here that
couldn't elsewhere).
```

Also add to the RULES section:
```
- CHARACTER descriptions: two physical details and one behavioral
  tell (a verb, not an adjective). No "commanding presence" —
  describe what a camera would capture.
- LOCATION descriptions: sensory anchor, then what naturally
  happens here, then what makes it dramatically unique.
```

---

## Priority Order

**Phase 1 — Prompt fixes (low risk, immediate impact on every generation):**
1. FIX A + B — Character template (Appearance + Personality)
2. FIX C — Location template (3-part structure)
3. FIX D — Lorebook generate prompt (prose prohibition vocabulary)
4. FIX G — DULFS one-liner format (visuals over motivation)
5. FIX E — Narrative Vector template (opposing goods framing)
6. FIX I — Forge/Crucible element description guidance

**Phase 2 — Structural additions (new Foundation fields):**
7. Remove orphaned Canon + Foundation Tensions from pipeline
8. GAP 1 — Intensity field in Foundation
9. GAP 2 — Story Contract field in Foundation

**Phase 3 — Deeper redesigns:**
10. FIX H — Style prompt (two tonal guides)
11. GAP 3 — Narrative Vector redesign (template + ensemble synthesis pass)
12. FIX F — Brainstorm Critic intensity diagnostic
13. GAP 4 — Bootstrap structural architecture

**Phase 4 — New generation modes:**
14. GAP 5 — Critique/Polish mode

---

## Reference

Source document: `external/the-craft-of-worldbuilding-and-writing.md`

Key sections:
- Intensity spectrum: "The Intensity Decision" + "The Intensity Spectrum in Practice"
- Story contract: "Clarifying What You're Writing"
- Plot situations: "Plot Situations" (Setup + Complication format)
- Cast list format: "The Cast List" under "Creating People, Not Character Sheets"
- Two tonal guides: "Finding Your Tonal Guides"
- Location 3-part formula: "Describing Locations That Work"
- Relationship web: "The Web of Relationships" (dependencies, secrets, historical echoes, ensemble map)
- Opening scene architecture: "The Shape of an Opening" + "Opening-Specific Prohibitions"
- Character introduction: "Character Introduction" (physical → behavioral → spatial)
- Prose prohibitions: "Prose Prohibitions: A Reference"
- Skeleton Method: "The Skeleton Method" (15 worked examples, pattern vocabulary)
- Quality Check: "The Quality Check"
