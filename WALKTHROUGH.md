# Walkthrough — Story Engine 0.10

The fastest way to go from "I have an idea" to "I'm writing a story" in NovelAI. Four panels, four steps, one flow.

---

## Before You Start

- Install Story Engine in a **new story** (fresh scenario recommended).
- You'll see three sidebar panels: **Brainstorm**, **Crucible**, and **Story Engine** — plus a **Story Engine** panel in the Lorebook view.

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

Crucible turns your brainstorm into a populated world. It works by first identifying the structural shape of your story, then generating dramatic tensions, then building world elements through an iterative command-driven process.

### 2a. Shape

**What to do:**
1. Switch to the **Crucible** panel.
2. Open the **Story Shape** section (it auto-expands when no shape is set).
3. Optionally type a shape name — *Slice of Life*, *Hero's Journey*, *Rivals*, whatever feels right. Or leave it blank and let the AI invent one.
4. Click **Generate**. The AI reads your brainstorm and invents a structural lens: a short description of what kind of moment this story is building toward.
5. Read the instruction. Edit the name or the instruction if something's off. This context flows into everything downstream.

**What's a shape?** Not a genre — a structural logic. *"Lean toward scenes of ordinary continuity — the texture of how these specific people inhabit their world"* is a shape (Slice of Life). *"Lean toward the moment after which the protagonist cannot be what they were"* is a shape (Threshold Crossing). The AI can invent any shape, not just the ones on a list.

**Tip:** You can skip this section entirely. Shape is optional — Direction and Tensions work fine without it. But setting a shape first produces more focused results.

### 2b. Direction

**What to do:**
1. Click **Generate** next to "Direction."
2. Watch the AI distill your brainstorm into a dense creative summary — characters (names, appearances, personalities), world, tone, supporting cast, dramatic tensions, and thematic tags. If your brainstorm is sparse, it extrapolates: inventing implied occupations, secondary figures, and latent pressures.
3. Read it. If something's off, click **Edit** and adjust. This text is the sole creative anchor for everything downstream — make sure it captures your vision.

**Tip:** If you didn't brainstorm (or want to start fresh), you can write the Direction yourself. Just describe your story in a few paragraphs.

### 2c. Tensions

**What to do:**
1. Click **Generate Tensions**. The AI generates dramatic tensions — concrete pressures, conflicts, and endpoints the story could build toward, shaped by your structural lens.
2. Generate more as needed. Each tension approaches your story from a different angle.
3. Toggle acceptance with the **check / X button** on each tension card. Green check = included in world build. Red X = excluded. Delete is only available when a tension is excluded — this prevents accidental removal of tensions you've accepted.

**What makes a good tension:** Something concrete enough to decompose into world requirements. *"The colony ship arrives but the crew discovers it's already inhabited"* is good. *"Everything changes"* is too vague.

### 2d. Build World

**What to do:**
1. Click **Build World** (below the Tensions section). The view switches to the Build World interface.
2. The AI runs a **build pass** — it reads the accepted tensions and generates world elements using structured commands: CREATE, REVISE, LINK, DELETE, and CRITIQUE. Each command produces a character, location, faction, system, narrative vector, or topic.
3. Watch the **World Elements** and **Relationships** sections populate as elements are created and linked together. A **Command Log** shows the raw operations.
4. If the AI produces a **self-critique** (shown in an amber box), it's flagging something it thinks is weak or missing.
5. Type **guidance** in the text box (e.g., "more factions," "Mira is too generic") and click **Next Pass** to run another round. Each pass can create new elements, revise existing ones, or delete weak ones.
6. Run as many passes as you want until the world feels right.

**Editing elements:** Every element is editable inline — click to edit, change the name or content. Delete with the trash icon. Relationships can be deleted individually too.

**When you're done:** Click **Merge to Story Engine** to push all elements into the World Entry fields and lorebook. A confirmation prompt ("Populate World Entry fields?") prevents accidental merges.

**What you get:** A world inventory derived through narrative logic and iterative refinement — not enumerated from a checklist.

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

**That's it.** One button. You can watch the status marquee as it works through each stage.

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
| **Crucible** | World generation from dramatic reasoning | Shape → Direction → Tensions → Build World → Merge |
| **Story Engine** | Scenario completion | S.E.G.A. button |
| **Lorebook** | Entry editing, refinement, keys | Generate/Refine per entry |

---

## Tips

- **Iterate, don't restart.** If SEGA's Canon or ATTG isn't quite right, regenerate just that field. You don't need to re-run everything.
- **Run multiple build passes.** Each pass can refine, add, or remove elements. Use guidance to steer the AI ("add a rival faction," "this character needs a secret"). More passes = richer, more interconnected world.
- **Edit the Direction freely.** It's the single source of truth for Crucible. A small tweak there changes everything downstream.
- **Shape is optional but useful.** You can skip it entirely — Direction and Tensions work without it. But setting a shape first (even just typing a name like "Slice of Life") gives Tension generation a clearer structural target.
- **Name your shape before generating.** If you type a name in the Shape name field before clicking Generate, the AI will only generate the instruction — faster and more focused than letting it invent the name too.
- **Summarize long brainstorms.** Before heading to Crucible, click **Sum** to compress a sprawling chat into dense material the Direction generator can work with.
- **The Lorebook panel** (in Lorebook view) lets you refine individual entries with natural language — "make her taller," "add a connection to the Silver Court," "rewrite this as more ominous."
- **Setting field** in Story Engine: if your story is set in an existing universe (Star Wars, Lord of the Rings), type it in the Setting field before running anything. Leave it as "Original" for original worlds.
