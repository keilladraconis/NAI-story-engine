# Walkthrough — Story Engine

Go from "I have an idea" to "I'm writing a story" in NovelAI. One sidebar panel, a handful of steps, one flow.

---

## Before You Start

Install Story Engine and open it in a story. The panel has two tabs:

- **Story Engine** — Foundation, Forge, and World.
- **Chat** — brainstorms, summaries, and field refine sessions.

A fresh story opens on the Chat tab with an empty Brainstorm — but before you type, hop to **Foundation → Intensity** and pick a register (Step 1). The brainstorm reads it.

---

## Step 1: Pick an Intensity

> _Story Engine tab → Foundation → Intensity_

Before you brainstorm, set the emotional register of your story. The Brainstorm assistant reads this and tunes itself to it — a Cozy story won't be pushed toward danger and manufactured conflict, and a Nightmare won't be softened with false reassurance.

| Level         | Feel                          |
| ------------- | ----------------------------- |
| **Cozy**      | Safe, warm, low stakes        |
| **Grounded**  | Realistic, everyday tension   |
| **Gritty**    | Harsh, morally complex        |
| **Noir**      | Cynical, dark, fatalistic     |
| **Nightmare** | Extreme, disturbing, no mercy |

This is the same Intensity you'll see in Foundation (Step 3) — set it now so it shapes the brainstorm, and revisit it there alongside the rest of your anchors.

**Haven't decided?** You can skip ahead and brainstorm with no Intensity set — the assistant will help you _find_ the register first (asking how much pressure the world is under, whether characters can walk away) instead of imposing one. Once you know, come back and pick it.

---

## Step 2: Brainstorm

> _Chat tab → Brainstorm_

A freeform conversation with the AI about what you want to write.

1. Type anything — a genre, a character, a vibe, a "what if." For example: _"Two rival chefs in 1920s Paris, one of them is secretly a spy."_
2. The AI responds with ideas and questions. Bounce them back and forth.
3. Don't worry about structure. The richer the brainstorm, the more the Forge has to work with.

The brainstorm matches your **Intensity** (Step 1). At Cozy and Grounded the cowriter is a warm collaborator that builds on your idea — _"what if…"_ rather than _"give her…/don't give her…"_; from Gritty up it stays direct and unsoftened, pressing on stakes and consequences.

**Move on** when you've described the _kind_ of story you want — characters, world, tone, conflicts. You need raw material, not an outline.

**Header controls:**

- **Co / Crit** switch the AI between cowriter (adds ideas) and critic (interrogates your assumptions). Both honor your Intensity register. Critic is sharpest mid-brainstorm; switch back to Co to develop what it surfaces. Don't leave a Critic question as the last message before Foundation or Forge — that framing carries into generation.
- **Sum** creates a separate **Summary** chat from the transcript. Reply to it to tighten or expand. Downstream generation reads the summary's latest reply, so you shape what the Forge sees without touching your raw brainstorm.
- **folder** manages every chat session. **+** starts a fresh Brainstorm.

---

## Step 3: Foundation

> _Story Engine tab → Foundation_

Foundation turns your brainstorm into structural anchors. Each field has a **⚡** button — it **generates** when the field is empty and opens a **Refine** chat when the field already has content — and a **pencil** for editing the text by hand.

### Intensity

The emotional register of your story (the table is back in [Step 1](#step-1-pick-an-intensity)). You ideally set this before brainstorming; if you skipped it, pick it here. It flows into everything downstream — the brainstorm, the Forge, and S.E.G.A. all read it.

### Shape

A structural lens: the kind of moment your story builds toward. Hit ⚡ and the AI reads your brainstorm to invent one, e.g. _"Lean toward the moment after which the protagonist cannot be what they were"_ (Threshold Crossing). Type a shape name first and the AI writes only the instruction — faster, and on target. Optional, but it focuses everything that follows.

### Intent

A plain statement of what the story explores. Hit ⚡ or write it yourself. Keep it honest — it anchors how the AI reads ambiguous choices later.

### Story Contract

Three directives that set the rules:

- **REQUIRED** — what the story must have.
- **PROHIBITED** — what it must never do.
- **EMPHASIS** — what to foreground.

The Forge and S.E.G.A. treat these as binding.

### ATTG & Style

- **ATTG (Memory)** — Author, Title, Tags, Genre. Flip the toggle to sync to the Story Memory.
- **Style (Author's Note)** — prose-tone guidelines. Flip the toggle to sync to the Author's Note.

Generate them here or leave them for S.E.G.A.

_Note_: The new Genre and Tags sections of the Story tab do not have script API, so we cannot update them based on your ATTG. If you prefer to use these, then flip off the toggle on ATTG.

### Refining a field

On any Foundation field that already has content, hit **⚡** to open a Refine chat scoped to that field:

1. The current text pins to the top as a **Context** bubble.
2. Steer with plain language: _"make this more ominous,"_ _"tighten to three sentences,"_ _"rewrite Style for first person."_
3. Each reply is a candidate. **Commit** writes the latest back into the field; **Discard** leaves it untouched.

A Refine runs as a normal chat session — step away to other work and come back to it via the Sessions list.

---

## Step 4: Forge

> _Story Engine tab → Forge, then the Chat tab_

The Forge builds your world — characters, locations, factions, systems, situations, topics — in a typed chat that walks three phases:

| Phase      | What it does                                                        |
| ---------- | ------------------------------------------------------------------- |
| **Sketch** | Breadth: characters, locations, factions, systems in broad strokes  |
| **Expand** | Depth: behavior-rich detail on thin entries; cut overlap            |
| **Weave**  | Bonds: thread relationships and author situational-dynamics entries |

**What to do:**

1. In the Forge section, optionally type **guidance** — _"focus on the rival factions,"_ _"give me a mentor and a corrupt official."_ Leave it blank to draw from your Brainstorm (run **Sum** first if the chat is long).
2. Hit **Forge**. You land in the Chat tab with a phase indicator in the header.
3. Drive it with the single send button:
   - **Empty input → ⚡ Forge Ahead** runs the next phase (Sketch → Expand → Weave → Sketch).
   - **Type a message → Send** discusses or instructs, changing only what you ask for — _"make Elara younger,"_ _"add a dockmaster named Halloran,"_ _"drop the second tavern."_

Each turn streams as **action chips** (Create / Revise / Thread, plus a running critique). New and changed elements appear as **draft cards** beneath the turn — they live in the session until you commit them. The Forge obeys your Story Contract and scales conflict to your Intensity.

**When you're done:** the bottom bar's **Commit** casts every draft into your World and drops you back on the Story Engine tab with World open; **Discard** drops them. **Back** leaves the session running so you can return later.

---

## Step 5: World

> _Story Engine tab → World_

Your world inventory — every entity, plus any you add by hand.

### Entities

Each card shows a category icon, the name (click to open the edit pane), and an SE-internal summary. In the edit pane you author the lorebook content and activation keys; the **Content** field has its own **Generate** and **Refine** buttons for iterating on a single entry. **+** in the World header creates an entity by hand.

### Threads

Threads are named groups of related entities — a faction and its members, a location cluster, a relationship web. They give generation relational context and can sync a group summary to the lorebook.

- **Layers** icon — create a Thread.
- Click a Thread title to edit its name and summary.
- Toggle - Activates Thread as a Lorebook entry, summary always-on.
- **trash** icon — clear all entities and threads (click twice to confirm). Your lorebook entries are kept; clearing only detaches Story Engine's management layer, and you can re-import them anytime.

### S.E.G.A.

**S.E.G.A.** in the World header fills your world in two stages:

1. **Lorebook Content** — entry text for every entity.
2. **Lorebook Keys** — activation keys so each entry fires in story text.

Watch the status as it works. You can also regenerate content or keys for any single entity from its edit pane — S.E.G.A. is the do-everything option.

---

## Step 6: Bootstrap (optional)

> _Story Engine tab → header **⚡ Opening Scene / ⚡ Continue Scene** button_

If the document is empty and you'd like the engine to write the opening, use the header button. It walks two user-triggered stages, and its label always tells you what the next click does:

1. **⚡ Opening Scene** — writes the cold open from your Shape, Intent, and Brainstorm: the protagonist already in the scene, mid-action, no introductions or backstory dumps. Then it stops.
2. **⚡ Continue Scene** — extends the opening one paragraph per click, picking up from the last sentence. Click as far as you like, or stop and write the rest by hand.

You decide how much the engine writes — nothing chains on its own. The button tracks the document: undo back to a blank page and it reads **⚡ Opening Scene** again. Prefer to write the opening yourself? Skip this step.

---

## Step 7: Write

Your scenario is ready:

- **Lorebook** — detailed entries with activation keys.
- **Memory** — your ATTG block.
- **Author's Note** — your Style guidelines.
- **Document** — your opening passage, if you bootstrapped one.

Start writing. Lorebook entries activate as their characters, locations, and concepts appear in the text.

---

## Starting From an Existing Story

Story Engine works with stories that already have lorebook entries, Memory, and Author's Note content.

Open it in such a story and the **Import Wizard** appears (or open it anytime via **Import** in the header). It has two sections:

**Foundation fields**

| Row                        | What it does                                                    |
| -------------------------- | --------------------------------------------------------------- |
| **Memory → ATTG**          | Pulls Memory text into the ATTG field and enables sync.         |
| **A/N → Style**            | Pulls Author's Note into the Style field and enables sync.      |
| **Story → Shape + Intent** | Reads your story and generates a Shape and Intent to anchor it. |

**Lorebook entries** — every unmanaged entry, grouped by auto-detected category (click a label to change it). **⚡ Bind** registers an entry as an entity without touching its text.

**Import All** does all of it in one click: Memory → ATTG, A/N → Style, binds every entry, and generates Shape and Intent from your story. It's the recommended starting point. From there, run S.E.G.A. to regenerate content and keys, use the Forge to add elements, or refine entries by hand.

Your lorebook is never destroyed. Removing the script, resetting, or clearing entities leaves the underlying NovelAI lorebook intact — Story Engine only adds a management layer on top.

---

## Quick Reference

| Tab / Section  | What it does                            | Key action                                           |
| -------------- | --------------------------------------- | ---------------------------------------------------- |
| **Chat**       | Brainstorms, summaries, field refines   | Set Intensity first, then chat; **Sum** to summarize |
| **Foundation** | Tone, shape, intent, contract, metadata | Intensity → Shape → Intent → Contract → ATTG/Style   |
| **Forge**      | World-element generation (typed chat)   | **Forge** → empty send = Forge Ahead, type = discuss |
| **World**      | Entities, Threads, S.E.G.A.             | Review entities → **S.E.G.A.**                       |
| **Bootstrap**  | Cold-open writer (header button)        | **⚡ Opening Scene**, then **⚡ Continue Scene**     |

---

## Tips

- **Iterate, don't restart.** If a field or entry isn't right, regenerate or refine just that one from its own ⚡ — no need to start over.
- **Re-run the Forge with guidance.** Each run builds on the existing world rather than recreating it. Steer it: _"add a rival faction," "this character needs a secret."_
- **Intensity first — before you even brainstorm.** It sets the register for every downstream generation, and the Brainstorm assistant now tunes to it: pick it in Foundation before your first message so a Cozy story stays cozy and a Nightmare keeps its dread. Unsure? Brainstorm with it unset and the assistant helps you find the register before imposing one.
- **Summarize long brainstorms.** Hit **Sum** before Foundation or Forge to compress a sprawling chat into dense material.
- **Group with Threads.** A Thread gives generation relational context and can surface a group-level lorebook entry.
- **Name an unnamed protagonist.** A nameless lead (_"the physician," "the captain"_) makes for collision-prone keys. Add a personal name in the edit pane and regenerate keys before you write.
