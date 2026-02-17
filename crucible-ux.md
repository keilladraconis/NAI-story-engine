# Crucible — User Experience Spec (MVP)

What the user sees, does, and understands. No implementation details. No jargon. If something isn't described here, the user shouldn't see it.

---

## What is the Crucible?

A world generator. The user has brainstormed ideas for a story. Now they want to turn those ideas into a world — characters, places, factions, rules, tensions — that they can write in.

The user sees: "I described what I want. The AI figured out what my world needs. Now I have a populated world to write in."

---

## The Screen

A sidebar panel. Fixed header at top (always visible). Scrollable body below.

### Header

- **Title**: "Crucible"
- **Status line**: One plain-English sentence describing what's happening now
- **Reset button**: Starts over (with confirmation)
- **Stop button**: Visible only during generation. Stops whatever's running.

Status line examples:
- "Describe your story's direction, or let the AI derive it from your brainstorm."
- "Review the generated goals. Star the ones you want to explore."
- "Building your world from 2 goals..."

The status line never uses internal vocabulary (phases, chains, beats, constraints, solver, builder).

---

## Step 1: Direction

**What the user sees**: A text area labeled "Direction" with a generate button and an edit button.

**What they do**: Write their own direction or click generate to have the AI derive one from their brainstorm.

**During generation**: Text streams into the display area in real time.

**After generation**: The direction is readable and editable. The user can regenerate, tweak manually, or move on. The presence of a direction enables the next step.

**What they understand**: "This is what my story is about."

---

## Step 2: Goals

**What the user sees**: Below the direction, a "Goals" section. A generate button and an "add" button.

**What they do**: Click generate. The AI produces dramatic endpoints — possible futures for this world. Each appears as a card.

**Goal cards**:
- Goal text, formatted for readability
- **Star button** (empty by default — NOT starred on creation)
- Delete button
- Edit button
- Can be added manually via "+ Add Goal"

**Starring**: The user stars goals that excite them. Starring means "I want the world to support this possibility." An unstarred goal is just an idea. A starred goal shapes world generation.

**What they understand**: "These are possible dramatic futures. I'm picking which ones matter. The AI will build a world that could lead to any of them."

**Moving forward**: A "Build World" button appears when at least one goal is starred.

---

## Step 3: World Building

**What the user sees**: The AI begins working. A streaming text area shows what the AI is thinking about — it's working out what the world needs to contain.

**The stream stays visible.** It does not vanish or get reformatted elsewhere. The user reads a live narrative of the AI's reasoning. When one chunk finishes, the next starts below it.

**World elements appearing**: As the AI reasons, it identifies characters, locations, factions, systems, and situations the world needs. These appear in a growing "World" section — a live inventory. Each element shows:
- Name
- What it is (character, location, etc.)
- Brief description

**Scene cards**: Each goal's reasoning appears as collapsible cards within the goal section, labeled by scene number. The stream is the primary reading experience; scene cards are for reference and re-reading. Cards are editable.

**Guidance**: The AI periodically assesses progress — world coverage, coherence, narrative shape — and produces a brief guidance note. The user can read and edit this to steer the AI's next decisions. When the AI acts on guidance, it's consumed. Label: "Guidance".

**What they understand**: "The AI is figuring out what my world needs. I can see it thinking. Characters and places are appearing. I can steer it with guidance, or just let it run."

---

## Step 4: Review & Merge

**When building completes**, the stream shows a completion message. The world inventory is populated.

The user now has:
- Their direction (editable)
- Their starred goals (editable)
- A world inventory of characters, locations, factions, systems, and situations

They can:
- Edit any world element
- Delete elements that don't resonate
- Accept the world and populate it into Story Engine's DULFS fields

---

## What the user NEVER sees

- "Phases" or phase transitions
- "Beats" — scene cards exist for reference, but the user never thinks in "beat 3" or "beat index"
- "Chaining" or "backward chaining" — the user sees "building your world"
- "Solver" or "Builder" — internal pipeline stages
- "Selected" as a default state — nothing is pre-selected
- Confirmation gates — the user's actions naturally advance the workflow

---

## Principles

1. **The user is reading, not operating a machine.** The primary experience during generation is reading a stream. Controls are secondary.

2. **Nothing vanishes.** Content the user was reading doesn't disappear and reappear elsewhere.

3. **No jargon.** Every label and button makes sense to someone who's never seen this tool.

4. **Stars, not checkboxes.** Starring a goal is creative enthusiasm, not form validation. Goals start unstarred.

5. **The world is the product.** The reasoning process is scaffolding. The user cares about the characters, places, and tensions that emerge.

6. **Progressive disclosure.** Direction enables goals. Goals enable building. Building produces world elements. Each step follows naturally.

---

## Future Enhancements (post-MVP)

These are not in the MVP but are designed-for in the architecture:

- **Per-goal progress indicators**: Compact status lines showing each goal's progress during building.
- **Constraints UI**: Expandable section showing the AI's open questions. Users can add, resolve, reopen, or delete constraints. Power-user feature.
- **Checkpoint/pause system**: AI pauses at natural moments to check in ("The world is getting complex — continue or simplify?"). User can continue, step back, or stop.
- **Step back**: Undo the last chunk of reasoning and let the AI try a different path.
- **"Which goals it serves"**: Show which goals each world element supports. Cross-goal elements are where tension lives.
- **Manually add world elements**: Add elements directly in Crucible rather than after merge.
- **Re-run building for a specific goal**: Regenerate one goal's contribution without resetting the whole world.
