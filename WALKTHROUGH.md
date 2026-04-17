# Walkthrough — Story Engine

The fastest way to go from "I have an idea" to "I'm writing a story" in NovelAI. Two panels, four steps, one flow.

---

## Before You Start

- Install Story Engine in a **new story** (fresh scenario recommended).
- You'll see one sidebar panel: **Story Engine** — which contains two tabs: **Story Engine** (Foundation, Forge, World) and **Brainstorm**.

---

## Step 1: Brainstorm

> _Panel: Brainstorm_

This is where your story begins — a freeform conversation with the AI about what you want to write.

**What to do:**

1. Open the **Brainstorm** panel.
2. Type anything — a genre, a character concept, a vibe, a "what if" question. Examples:
   - _"I want to write dark fantasy with political intrigue"_
   - _"A space station where the AI running life support has started making art"_
   - _"Two rival chefs in 1920s Paris, one of them is secretly a spy"_
3. The AI responds with ideas, questions, and suggestions. Bounce ideas back and forth.
4. Don't worry about structure — just get your ideas flowing. The messier the brainstorm, the more material the Forge has to work with.

**When to move on:** When you feel like you've described the _kind_ of story you want to tell — characters, world, tone, conflicts. You don't need a complete outline, just enough creative raw material.

**Tips:**

- The **Co / Crit** buttons in the header switch the AI between cowriter mode (generative, adds ideas) and critic mode (interrogates your assumptions). Critic mode is most useful mid-brainstorm — surface gaps, push back on thin ideas, then switch back to Cowriter to develop them. **Avoid ending on a Critic message before moving to Foundation/Forge:** if the last message is a Critic question, that framing can propagate into downstream generation.
- If the chat is getting long, click **Sum** to collapse it into a dense summary.
- Use the **folder icon** to manage multiple named sessions — useful for keeping separate story ideas organized.

---

## Step 2: Foundation

> _Panel: Story Engine → Foundation section_

Foundation turns the raw energy of your brainstorm into a set of structural anchors: the tone, the shape, the intent, and the contract of your story.

**What to do:**

1. Switch to the **Story Engine** panel. The **Foundation** section is at the top.
2. Work through each field:

### Intensity

Sets the tonality register of your story. Choose from:

| Level | Description |
|-------|-------------|
| **Cozy** | Safe, warm, low stakes |
| **Grounded** | Realistic, everyday tension |
| **Gritty** | Harsh, morally complex |
| **Noir** | Cynical, dark, fatalistic |
| **Nightmare** | Extreme, disturbing, no mercy |

Pick the level that matches the emotional register you want. This flows into generation downstream.

### Shape

A structural lens — what kind of moment your story is building toward. Click **Generate** and the AI reads your brainstorm to invent one. Examples:
- _"Lean toward scenes of ordinary continuity — the texture of how these specific people inhabit their world"_ (Slice of Life)
- _"Lean toward the moment after which the protagonist cannot be what they were"_ (Threshold Crossing)

Edit the name or description if something's off. You can also type a shape name before generating — the AI will write only the instruction, which is faster.

**Tip:** Shape is optional but focuses everything downstream. Even typing a name like "Heist" before generating helps.

### Intent

A plain statement of what this story is exploring. Click **Generate** or write it yourself: _"What is this story about? What do you want to explore?"_ Keep it honest — this anchors the AI's interpretation of ambiguous choices later.

### Story Contract

Three directives that define the rules of your story:

- **REQUIRED** — What the story must have (e.g., "morally grey protagonists," "no magic systems")
- **PROHIBITED** — What the story must never do (e.g., "no redemption arcs," "no comic relief")
- **EMPHASIS** — What to foreground (e.g., "atmosphere over plot," "character interiority")

Click **Generate** for a suggestion based on your brainstorm, or write your own.

### ATTG & Style

- **ATTG (Memory)** — Author, Title, Tags, Genre block. Syncs to Memory. Generate or write manually.
- **Style (Author's Note)** — Style guidelines for prose tone. Syncs to Author's Note.

These can also be generated later as part of S.E.G.A.

---

## Step 3: Forge

> _Panel: Story Engine → Forge section_

The Forge builds your world. It reads your Foundation and Brainstorm, then generates world elements — characters, locations, factions, systems, dynamics, topics — through an iterative, guidance-driven loop.

**What to do:**

1. Scroll to the **Forge** section in the Story Engine panel.
2. Optionally type **guidance** in the text field — what should the Forge build? You can leave it blank and it will draw from your Brainstorm conversation.
   - Examples: _"Focus on the rival factions"_, _"Give me a mentor figure and a corrupt official"_, _"More locations"_
3. Click **Forge**. Watch as the AI generates world elements.
4. Type new guidance and click **Forge** again to refine, add, or redirect. Run as many passes as you want.

**Viewing results:** Generated elements appear in the **World** section below, organized by category and optionally grouped into Threads.

**When you're done:** When your world feels populated enough to start writing.

---

## Step 4: World

> _Panel: Story Engine → World section_

The World section is your world inventory — every entity the Forge created, plus any you add manually.

### Entities

Each entity card shows:
- Category icon (character, system, location, faction, dynamic, topic)
- Name (click to edit in the edit pane)
- Summary (SE-internal description)

From the edit pane you can also view and edit lorebook content and keys (once an entity has been cast to the lorebook).

**Adding entities manually:** Click **+** in the World section header to create a new entity.

### Threads

Threads are named groups of related entities — a faction and its key members, a location cluster, a relationship web. They help organize your world and can optionally sync a summary to the lorebook as a group entry.

- Click the **Layers** icon in the World section header to create a new Thread.
- Click a Thread title to edit its name and summary.
- Toggle lorebook sync per Thread with the lorebook icon.
- Click the **trash** icon in the World section header to clear all entities and threads. A second click is required to confirm. Lorebook entries are **preserved** — clearing only detaches entities from Story Engine management. You can re-import them at any time via the Import Wizard.

### Running S.E.G.A.

Once your world is built, click **S.E.G.A.** in the World section header. It runs two stages automatically:

1. **Lorebook Content** — Generates detailed entry text for every world entity.
2. **Lorebook Keys** — Generates activation keys for each entry so they fire correctly in story text.

Watch the status updates as it works through your entities. You can also regenerate content or keys for any individual entity from its edit pane — S.E.G.A. is just the "do everything" option.

---

## Step 5: Write

Your scenario is ready:

- **Lorebook** is populated with detailed entries and activation keys.
- **Memory** has your ATTG block (if generated in Foundation).
- **Author's Note** has your Style Guidelines (if generated in Foundation).

Start writing in the document. Lorebook entries activate as relevant characters, locations, and concepts appear in the text.

---

---

## Using Story Engine with an Existing Story

Story Engine is designed to work with stories that already have lorebook entries, Memory, and Author's Note content — not just fresh starts.

### Lorebook Persistence

**Lorebooks are never destroyed by Story Engine.** Removing the script, resetting the engine, or clearing all entities does not touch the NovelAI lorebook. Your entries are always safe. What Story Engine adds is a management layer: binding entries as typed entities, generating content and keys for them, and organizing them into threads. That layer can be removed or rebuilt at any time without affecting the underlying lorebook data.

### The Import Wizard

When you open Story Engine in a story that already has lorebook entries, Memory content, or Author's Note text — and no Story Engine entities have been set up yet — the Import Wizard opens automatically. You can also open it at any time via the **Import** button in the panel header.

The wizard has two sections:

**Foundation Fields**

| Row | What it does |
|-----|-------------|
| **Memory → ATTG** | Imports existing Memory text into the Foundation ATTG field and enables sync. |
| **A/N → Style** | Imports existing Author's Note text into the Foundation Style field and enables sync. |
| **Story → Shape + Intent** | Reads your existing story content — lorebook, Memory, document — and generates a Shape and Intent to anchor the Foundation for this story. |

**Lorebook Entries**

All unmanaged lorebook entries are listed, grouped by category. For each entry:
- The category is auto-detected from the entry text (Character, Location, Faction, etc.). Click the category label to cycle through options.
- Click **⚡ Bind** to register the entry as a Story Engine entity. The existing lorebook text is preserved exactly — binding doesn't modify the entry, it just makes it visible and manageable in the World section.

### Import All

The **Import All** button in the wizard header does everything in one click:

1. Imports Memory → ATTG (if Memory has content)
2. Imports Author's Note → Style (if A/N has content)
3. Binds all unmanaged lorebook entries as entities, using the auto-detected category for each
4. Triggers Shape and Intent generation from your existing story context

This is the recommended starting point when adding Story Engine to an existing story. After Import All, your World section will be populated with all your existing lorebook entries as entities, your Foundation fields will reflect your existing metadata, and Shape/Intent will be generated to anchor generation to your story's actual structure.

From there you can run S.E.G.A. to regenerate lorebook content and keys with Story Engine's prompts, use the Forge to add new world elements, or use the entity edit panes to refine individual entries.

---

## Quick Reference

| Tab / Section   | What it does                            | Key action                                         |
| --------------- | --------------------------------------- | -------------------------------------------------- |
| **Brainstorm**  | Freeform idea conversation              | Chat, summarize, manage sessions                   |
| **Foundation**  | Tone, shape, intent, contract, metadata | Set Intensity → Shape → Intent → Contract → ATTG/Style |
| **Forge**       | World element generation                | Enter guidance → Forge (repeat)                    |
| **World**       | World inventory, threads, S.E.G.A.      | Review entities → Run S.E.G.A.                     |

---

## Tips

- **Iterate, don't restart.** If S.E.G.A.'s Canon or ATTG isn't right, regenerate just that field.
- **Run multiple Forge passes.** Each pass can add, refine, or redirect. Use guidance to steer: _"add a rival faction," "this character needs a secret."_
- **Intensity sets the emotional register.** It flows into all downstream generation — pick it before generating Shape or running the Forge.
- **Shape is optional but useful.** Even typing a name like "Slice of Life" before generating gives the Forge and S.E.G.A. a clearer structural target.
- **Summarize long brainstorms.** Click **Sum** before moving to Foundation/Forge to compress a sprawling chat into dense material.
- **The Lorebook panel** (in Lorebook view) lets you refine individual entries with natural language — _"make her taller," "add a connection to the Silver Court," "rewrite this as more ominous."_
- **Threads for organization.** Group related entities into a Thread to give generation a relational context and to optionally surface a group-level lorebook entry.
- **Unnamed protagonists and lorebook collision.** If your protagonist has no personal name (e.g., "the physician," "the captain"), their lorebook entry may have high collision risk. Before you start writing, open the entity edit pane and add a personal name — then regenerate its keys so activation is specific.
