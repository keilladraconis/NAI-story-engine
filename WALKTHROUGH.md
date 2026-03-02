# Welcome Back Walkthrough — Story Engine 0.9.0

The fastest way to go from "I have an idea" to "I'm writing a story" in NovelAI. Four panels, four steps, one flow.

---

## Before You Start

- Install Story Engine 0.9.0 in a **new story** (fresh scenario recommended).
- You'll see three sidebar panels: **Brainstorm**, **Crucible**, and **Story Engine** — plus a **Lorebook** panel in the Lorebook view.

---

## Step 1: Brainstorm

> *Panel: Brainstorm*

This is where your story begins — a freeform conversation with the AI about what you want to write.

**What to do:**
1. Open the **Brainstorm** panel.
2. Type anything — a genre, a character concept, a vibe, a "what if" question. Examples:
   - *"I want to write dark fantasy with political intrigue"*
   - *"A space station where the AI running life support has started making art"*
   - *"Two rival chefs in 1920s Paris, one of them is secretly a spy"*
3. The AI responds with ideas, questions, and suggestions. Bounce ideas back and forth.
4. Don't worry about structure — just get your ideas flowing. The messier the brainstorm, the more material Crucible has to work with.

**When to move on:** When you feel like you've described the *kind* of story you want to tell — characters, world, tone, conflicts. You don't need a complete outline, just enough creative raw material.

**Tips:**
- The **Co / Crit** buttons in the header switch the AI between cowriter mode (generative, adds ideas) and critic mode (interrogates your assumptions).
- If the chat is getting long, click **Sum** to collapse it into a dense summary before heading to Crucible.
- Use the **folder icon** to manage multiple named sessions — useful for keeping separate story ideas organized.

---

## Step 2: Crucible

> *Panel: Crucible*

Crucible turns your brainstorm into a populated world. It works by first identifying the structural shape of your story, then imagining dramatic endpoints, then reasoning backward to discover what the world must contain.

### 2a. Shape

**What to do:**
1. Switch to the **Crucible** panel.
2. Open the **Story Shape** section (it auto-expands when no shape is set).
3. Optionally type a shape name — *Slice of Life*, *Hero's Journey*, *Rivals*, whatever feels right. Or leave it blank and let the AI invent one.
4. Click **Generate**. The AI reads your brainstorm and invents a structural lens: a short description of what kind of moment this story is building toward.
5. Read the instruction. Edit the name or the instruction if something's off. This context flows into everything downstream.

**What's a shape?** Not a genre — a structural logic. *"Lean toward scenes of ordinary continuity — the texture of how these specific people inhabit their world"* is a shape (Slice of Life). *"Lean toward the moment after which the protagonist cannot be what they were"* is a shape (Threshold Crossing). The AI can invent any shape, not just the ones on a list.

**Tip:** You can skip this section entirely. Shape is optional — Direction and Goals work fine without it. But setting a shape first produces more focused results.

### 2b. Direction

**What to do:**
1. Click **Generate** next to "Direction."
2. Watch the AI distill your brainstorm into a dense creative summary — characters (names, appearances, personalities), world, tone, supporting cast, dramatic tensions, and thematic tags. If your brainstorm is sparse, it extrapolates: inventing implied occupations, secondary figures, and latent pressures.
3. Read it. If something's off, click **Edit** and adjust. This text is the sole creative anchor for everything downstream — make sure it captures your vision.

**Tip:** If you didn't brainstorm (or want to start fresh), you can write the Direction yourself. Just describe your story in a few paragraphs.

### 2c. Goals

**What to do:**
1. Click **Generate Goals**. The AI generates three dramatic endpoints — concrete moments the story could arrive at, shaped by your structural lens.
2. Generate more as needed (3–5 is a good number). Each goal approaches your story's tension from a different angle.
3. Read the **why** beneath each goal — the AI's reasoning for why it's a compelling endpoint. Use it to judge which goals are most worth building.
4. Toggle acceptance with the **check / X button** on each goal card. Green check = included in world build. Red X = excluded. Delete is only available when a goal is excluded — this prevents accidental removal of goals you've accepted.
5. Add your own with the **+ Goal** button.

**What makes a good goal:** Something concrete enough to decompose into world requirements. *"The colony ship arrives but the crew discovers it's already inhabited"* is good. *"Everything changes"* is too vague.

### 2d. Build World

**What to do:**
1. Click **Build World**. Sit back and watch.
2. Crucible first derives **prerequisites** — things that must be true about the world for the accepted goals to be narratively possible: relationships, secrets, power structures, histories, objects, beliefs, places.
3. Then it generates **world elements** — characters, locations, factions, systems, and situations — that satisfy those prerequisites. Secondary characters, rivals, and background figures are included to make the world feel inhabited.
4. A progress checklist shows where you are in the pipeline. When generation completes, the phase advances to Review.

**What you get:** A world inventory derived through narrative logic, not enumerated from a checklist.

### 2e. Review

**What to do:**
1. Browse the **Prerequisites** and **World Elements** sections. Prerequisites show what the world structurally needs; elements show what you actually get.
2. Edit or delete anything that doesn't fit. Each element is individually editable inline.
3. When you're satisfied, click **Merge** to push everything into Story Engine's DULFS fields and lorebook.
4. After merging, you can click **Expand** on any element to run a mini-chain from it — generating new prerequisites and elements branching out from that character, place, or faction.

---

## Step 3: Story Engine (S.E.G.A.)

> *Panel: Story Engine*

SEGA — Story Engine Generate All — takes your world and generates everything needed for a complete scenario.

**What to do:**
1. Switch to the **Story Engine** panel.
2. Click the **S.E.G.A.** button.
3. SEGA runs automatically through its stages:
   - **ATTG & Style** — Generates Author/Title/Tags/Genre (syncs to Memory) and Style Guidelines (syncs to Author's Note).
   - **Canon** — Synthesizes an authoritative summary of your world from all the elements Crucible produced.
   - **Bootstrap** — If your document is empty, writes an opening scene instruction directly into the document.
   - **Lorebook** — Generates detailed content for every lorebook entry, then builds relational maps, and finally produces activation keys informed by those maps.

**That's it.** One button. You can watch the status indicator as it works through each stage.

**Prefer control?** You can generate any field individually instead of running SEGA. Each field has its own Generate button. SEGA is just the "do everything" option.

---

## Step 4: Write

Your scenario is ready:
- **Lorebook** is populated with detailed entries and activation keys.
- **Memory** has your ATTG block.
- **Author's Note** has your Style Guidelines.
- **Document** has an opening scene instruction (from Bootstrap).

Start writing, or click Generate in the editor to let the AI continue from the bootstrapped opening. Your lorebook entries will activate as relevant characters, locations, and concepts appear in the text.

---

## Quick Reference

| Panel | What it does | Key action |
|-------|-------------|------------|
| **Brainstorm** | Freeform idea conversation | Chat, summarize, manage sessions |
| **Crucible** | World generation from dramatic reasoning | Shape → Direction → Goals → Build World → Review & Merge |
| **Story Engine** | Scenario completion | S.E.G.A. button |
| **Lorebook** | Entry editing, refinement, keys | Generate/Refine per entry |

---

## Tips

- **Iterate, don't restart.** If SEGA's Canon or ATTG isn't quite right, regenerate just that field. You don't need to re-run everything.
- **Build from multiple goals.** Each goal produces different prerequisites and elements. More goals built = richer, more interconnected world.
- **Edit the Direction freely.** It's the single source of truth for Crucible. A small tweak there changes everything downstream.
- **Use Expand after merging.** Any world element can seed more generation. Drill into a character's backstory, a faction's internal politics, or a location's history.
- **Shape is optional but useful.** You can skip ShapeSection entirely — Direction and Goals work without it. But setting a shape first (even just typing a name like "Slice of Life") gives Goal generation a clearer structural target.
- **Name your shape before generating.** If you type a name in the Shape name field before clicking Generate, the AI will only generate the instruction — faster and more focused than letting it invent the name too.
- **Summarize long brainstorms.** Before heading to Crucible, click **Sum** to compress a sprawling chat into dense material the Direction generator can work with.
- **The Lorebook panel** (in Lorebook view) lets you refine individual entries with natural language — "make her taller," "add a connection to the Silver Court," "rewrite this as more ominous."
- **Setting field** in Story Engine: if your story is set in an existing universe (Star Wars, Lord of the Rings), type it in the Setting field before running anything. Leave it as "Original" for original worlds.
