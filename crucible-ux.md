# Crucible — User Experience Spec

This document describes what the user sees, does, and understands at every moment. No implementation details. No phase names. No "beats." If something isn't described here, the user shouldn't see it.

---

## What is the Crucible?

The Crucible is a world generator. The user has brainstormed ideas for a story. Now they want to turn those ideas into a world — characters, places, factions, rules, tensions — that they can write in. The Crucible takes their creative direction and builds that world by reasoning backward from dramatic endpoints.

The user does not need to know it works by backward chaining. They see: "I described what I want. The AI figured out what my world needs to contain. Now I have a populated world to write in."

---

## The Screen

A sidebar panel. Fixed header at top (always visible). Scrollable body below.

### Header (always visible)

- **Title**: "Crucible" (or similar — not "Crucible v5")
- **Status line**: One plain-English sentence describing what's happening right now
- **Reset button**: Starts over (with confirmation)
- **Stop button**: Visible only during generation. Stops whatever's running.

Status line examples:
- "Describe your story's direction, or let the AI derive it from your brainstorm."
- "Review the generated goals. Star the ones you want to explore."
- "Building your world from 2 goals..."
- "Paused — the world is getting complex. Review and continue, or step back."

The status line never uses internal vocabulary (phases, chains, beats, constraints, solver, builder). It speaks to the user.

---

## Step 1: Direction

**What the user sees**: A text area labeled "Direction" with a generate button and an edit button.

**What they do**: Either write their own direction ("A noir detective story set in a flooded megacity where the water itself is alive") or click generate to have the AI derive one from their brainstorm.

**During generation**: Text streams into the display area in real time. The user watches the AI think.

**What is produced?**: The direction distills the intent and direction from the user's brainstorm. It includes key characters and their vital statistics, the narrative vectors and themes, and a list of tags enumerating those themes, directives and details.

**After generation**: The direction sits there, readable and editable. The user can regenerate, tweak it manually, or move on. No confirmation step. No "phase transition." They just... have a direction now. The presence of a direction enables the next step.

**What they understand**: "This is what my story is about."

---

## Step 2: Goals

**What the user sees**: Below the direction, a "Goals" section appears. A generate button, clear button, and an "add" button.

**What they do**: Click generate. The AI produces 3 dramatic endpoints — possible futures for this world. Each appears as a card showing what that future looks like and what's at stake.

**Goal cards**:
- Show the goal text, formatted for readability
- Have a **star button** (empty by default — the goal is NOT starred on creation)
- Have a delete button
- Have an edit button to manually revise
- Can be added manually via "+ Add Goal"

**Starring**: The user reads the goals and stars the ones that excite them. Starring means "I want the world to support this possibility." An unstarred goal is just an idea the AI had. A starred goal actively shapes world generation.

**What they understand**: "These are possible dramatic futures. I'm picking which ones matter to me. The AI will build a world that could lead to any of them."

**Moving forward**: A "Build World" button appears when at least one goal is starred. The label says what it does — it builds the world.

---

## Step 3: World Building

**What the user sees**: The AI begins working. A streaming text area shows what the AI is thinking about — it's deriving what the world needs to contain in order to support the starred goals.

**The stream stays visible**. It does not vanish. It does not get reformatted into cards elsewhere. The user is reading a live narrative of the AI's reasoning process. When a chunk of reasoning finishes, the next chunk starts below it in the same stream. The stream is the primary reading experience during this phase.

**Progress indicators**: Per goal, a compact status line shows progress:
- Goal name/summary
- How far along it is (qualitative, not "5 beats 3 open")
- Whether it's done

These are summary indicators, not an alternate view of the content. The stream is where the user reads. The indicators are where they glance to see overall progress.

**World elements appearing**: As the AI reasons, it identifies characters, locations, factions, systems, and situations that the world needs. These appear in a growing "World" section below the stream — a live inventory of what's being built. Each element shows:
- Name
- What it is (character, location, etc.)
- Brief description
- Which goals it serves (if multiple — that's the good stuff, that's where dramatic tension lives)

**Guidance**: The AI periodically assesses progress — narrative shape, world coverage, pacing — and shows a brief guidance note. The user can read and edit this to steer the AI's next decisions. When the AI acts on guidance, it's consumed and won't repeat. Label: "Guidance".

**Constraints** (progressive disclosure): An expandable section shows the AI's open questions (constraints). Power users can add questions, mark them resolved, reopen them, or delete them. This is advanced — most users will never touch it.

**Beat cards**: Each goal's reasoning appears as collapsible cards within the goal section. The stream remains the primary reading experience; cards are for reference and re-reading.

**The user's role during building**: Mostly watching. But the AI may pause at natural moments:
- "A major power structure is emerging. Does this feel right?"
- "The world is getting complex — 12 elements across 3 goals. Continue or simplify?"

At a pause, the user can:
- **Continue** — keep going
- **Step back** — undo the last chunk of reasoning and let the AI try again
- **Stop** — end generation where it is and work with what exists

If the user doesn't want pauses, there should be an "auto" mode that runs to completion.

**What they understand**: "The AI is figuring out what my world needs. I can see it thinking. Characters and places are appearing as it works. I can intervene if something goes wrong, or just let it run."

---

## Step 4: Review & Refine

**When building completes**, the stream shows a completion message. The world inventory is fully populated.

The user now has:
- Their direction (editable)
- Their starred goals (editable)
- A world inventory of characters, locations, factions, systems, and situations — each one existing because the narrative logic required it

They can:
- Edit any world element
- Delete elements that don't resonate
- Manually add elements
- Re-run building for a specific goal
- Accept the world and let it populate into the Story Engine's DULFS fields

---

## What the user NEVER sees or needs to understand

- "Phases" or phase transitions
- "Beats" as primary UI — beat cards exist for reference, but the stream is the primary reading experience. The user never needs to think in terms of "beat 3" or "beat index"
- "Chaining" or "backward chaining" — the user sees "building your world"
- "Solver" or "Builder" — these are internal pipeline stages
- "Selected" as a default state — nothing is pre-selected
- Confirmation gates between sections — the user's actions (writing direction, starring goals, clicking "Build World") naturally advance the workflow without explicit "confirm" steps

---

## Principles

1. **The user is reading, not operating a machine.** The primary experience during generation is reading a stream of AI reasoning. Controls exist but are secondary.

2. **Nothing vanishes.** If the user was reading something, it doesn't disappear and reappear in a different format elsewhere. Content transforms are disorienting.

3. **No jargon.** Every label, status line, and button name should make sense to someone who has never seen this tool before and doesn't know what backward chaining is.

4. **Stars, not checkboxes.** Starring a goal is an act of creative enthusiasm, not form validation. Goals start unstarred. The user opts in with intention.

5. **The world is the product.** The reasoning process (backward chaining, beats, constraints) is scaffolding. The user cares about the characters, places, and tensions that emerge. The scaffolding should be visible (because watching the AI think is interesting) but not elevated to primary UI status.

6. **Progressive disclosure.** Direction enables goals. Goals enable building. Building produces world elements. Each step naturally follows from the previous one without gates or confirmations.

7. **Pausable, not phasey.** The AI can pause to check in. The user can stop at any time. But there are no explicit "you are now in Phase 3" transitions. The workflow flows.
