# Welcome Back Walkthrough — Story Engine 0.7.0

The fastest way to go from "I have an idea" to "I'm writing a story" in NovelAI. Four panels, four steps, one flow.

---

## Before You Start

- Install Story Engine 0.7.0 in a **new story** (fresh scenario recommended).
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

---

## Step 2: Crucible

> *Panel: Crucible*

Crucible turns your brainstorm into a populated world. It works by imagining dramatic endpoints for your story, then reasoning backward to discover what the world must contain.

### 2a. Direction

**What to do:**
1. Switch to the **Crucible** panel.
2. Click **Generate** next to "Direction."
3. Watch the AI distill your brainstorm into a dense creative summary — characters, world, tone, dramatic tensions, story architecture, and thematic tags.
4. Read it. If something's off, click **Edit** and adjust. This text is the sole creative anchor for everything downstream — make sure it captures your vision.

**Tip:** If you didn't brainstorm (or want to start fresh), you can write the Direction yourself. Just describe your story in a few paragraphs.

### 2b. Goals

**What to do:**
1. Click **Generate** in the Goals section. A dramatic endpoint appears — a concrete moment the story could arrive at.
2. Generate a few more (3-5 is a good number). Each goal approaches your story's tension from a different angle.
3. Delete any goals that don't resonate. You can also **add your own** with the + button.

**What makes a good goal:** Something concrete enough to decompose into scenes. *"The colony ship arrives but the crew discovers it's already inhabited"* is good. *"Everything changes"* is too vague.

### 2c. Build World

**What to do:**
1. Click **Build World** on any goal that excites you. Sit back and watch.
2. The AI begins exploring scenes backward from the goal. You'll see:
   - **Streaming text** — the AI's reasoning in real time. This is the primary reading experience.
   - **Scene cards** — collapsible summaries that appear within each goal's section.
   - **World elements** — characters, locations, factions, systems, and situations appearing in a growing inventory as the AI extracts them from scenes.
3. When the scene budget is exhausted, building completes.

**What you get:** A world inventory of interconnected elements — all discovered through narrative reasoning, not enumerated from a checklist. Build multiple goals for a richer world — elements from different goals reference each other because they share the same world state.

### 2d. Review

**What to do:**
1. Scroll through the world elements. Edit or delete anything that doesn't fit.
2. The elements will merge into Story Engine's DULFS fields when you proceed to SEGA.

---

## Step 3: Story Engine (S.E.G.A.)

> *Panel: Story Engine*

SEGA — Story Engine Generate All — takes your world and generates everything needed for a complete scenario.

**What to do:**
1. Switch to the **Story Engine** panel.
2. Click the **S.E.G.A.** button.
3. SEGA runs automatically through four stages:
   - **ATTG & Style** — Generates Author/Title/Tags/Genre (syncs to Memory) and Style Guidelines (syncs to Author's Note).
   - **Canon** — Synthesizes an authoritative summary of your world from all the elements Crucible produced.
   - **Bootstrap** — If your document is empty, writes an opening scene instruction directly into the document.
   - **Lorebook** — Generates detailed content and activation keys for every lorebook entry.

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
| **Brainstorm** | Freeform idea conversation | Chat with the AI |
| **Crucible** | World generation from dramatic reasoning | Generate Direction, Goals, Build World |
| **Story Engine** | Scenario completion | S.E.G.A. button |
| **Lorebook** | Entry editing, refinement, keys | Generate/Refine per entry |

---

## Tips

- **Iterate, don't restart.** If SEGA's Canon or ATTG isn't quite right, regenerate just that field. You don't need to re-run everything.
- **Build multiple goals.** Different goals produce different world elements. More goals built = richer world.
- **Edit the Direction freely.** It's the single source of truth for Crucible. A small tweak there changes everything downstream.
- **The Lorebook panel** (in Lorebook view) lets you refine individual entries with natural language — "make her taller," "add a connection to the Silver Court," "rewrite this as more ominous."
- **Setting field** in Story Engine: if your story is set in an existing universe (Star Wars, Lord of the Rings), type it in the Setting field before running anything. Leave it as "Original" for original worlds.
