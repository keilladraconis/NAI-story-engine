# FUTURE.md — Story Engine v11 Design

## What's Wrong With v10

Story Engine is a pipeline, not an engine. Crucible builds a world, SEGA populates lorebook entries, keys get generated, and then — silence. The system that built the world goes inert.

Three specific problems:

1. **Crucible's relationships get lost.** BUILD/LINK commands produce rich, directional connections (`Kael → The Warden — imprisoned here as a child`). After merge, these vanish. SEGA's relational maps try to reconstruct them, but they're ephemeral flat text that exists only to inform keys, then gets garbage collected.

2. **Direction and Canon are redundant or misplaced.** Direction (what the story is about) is consumed once during Canon synthesis and forgotten. Canon (what is true) summarizes things the lorebook already covers. Neither is injected dynamically into ongoing generation.

3. **Worldbuilding is a phase, not a capability.** After merge, Crucible is vestigial. No way to add characters mid-story, expand a location, or introduce a faction — not without starting a new Crucible session that's disconnected from the existing world.

---

## The v11 Architecture

### Three Layers, One Engine

| Layer | Purpose | Current home | v11 |
|-------|---------|-------------|-----|
| **Forge** | Creative generation — inventing entities, relationships, structural reasoning | Crucible | Always available |
| **Realize** | Lorebook population, key generation | SEGA | Runs on Cast |
| **Curate** | Context management during story writing | Doesn't exist | New |

Crucible isn't a separate product — it's the forge layer. SEGA isn't Story Engine's core — it's the realization layer. They unify into a single system.

### The Entity Lifecycle

```
Forge ──→ Draft ──→ Cast ──→ Live
  ↑                            │
  └────── Reforge ─────────────┘
```

**Forge:** The AI generates entities, relationships, and structural elements via BUILD/LINK commands. Intent-driven — the user says what they need, the forge produces a holistic cluster across categories.

**Draft (the Forge workspace):** Forged entities live here for review. They're not in the lorebook yet. This is a **draft area, not a planning tool** — Story Engine facilitates the Now, not predestined futures. Users review, discard what doesn't fit, and Cast when satisfied.

**Cast:** The release action. Moves draft entities into the lorebook. SEGA realization runs (content, keys). Entities become Live.

**Live:** Entities are in the lorebook with active keys, affecting story generation.

**Reforge:** Pull Live entities back into the Forge for reshaping. Works at two levels:
- **Batch-level:** The whole batch lifts into the Forge. User adds new intent, forge expands with awareness of existing members. On Cast, existing entities keep their lorebook bindings; new entities get SEGA realization.
- **Entity-level** (via Lorebook Extension): A single entity lifts for revision. Returns to its original batch on Cast.

**Discard vs Delete:** Discarding Reforged entities returns them unchanged to their Live batch — it's "nevermind," not deletion. Only freshly forged entities (never Cast) are removed by discard. Permanent deletion is a separate per-entity action.

### Naming

- **Cast** (not "Merge") — metallurgical: raw material shaped in the Crucible, cast into usable form. Also theatrical (cast into roles) and incantatory (conjured into existence).
- **Reforge** (not "Recall") — pull back into the forge to reshape. Coherent with the metallurgical metaphor.
- **Bind** — connect an existing user-created lorebook entry to Story Engine's management. Cast pours new things from the forge; Bind connects existing things to the engine.

---

## UI Design

### Surfaces

**Sidebar Panel 1: Story Engine** (unified Crucible + Story Engine)
**Sidebar Panel 2: Brainstorm** (separate — chat is a different interaction mode)
**Lorebook UI Extension** (script tab inside NovelAI's lorebook editing modal, scoped to a single entry)
**Generation Journal** (diagnostic, unchanged)

Three sidebar panels → two. Brainstorm stays separate because it's conversational. The Lorebook Extension is not a sidebar panel — it's contextual to a single entry inside the native lorebook modal.

### Story Engine Panel Layout

```
┌─────────────────────────────────────────────┐
│  ⚡ Story Engine          [▶ SEGA] [✕ Clear] │
│  ░░░░░░░ status marquee ░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────────┤
│                                             │
│  ▸ Narrative Foundation                     │
│  ┊  Shape: TRAGEDY                     [⚡] │
│  ┊                                          │
│  ┊  Intent:                                 │
│  ┊  "A story about a prince returning       │
│  ┊   to the empire that exiled him..." [✎]⚡│
│  ┊                                          │
│  ┊  World State:                            │
│  ┊  "The empire is fracturing under the     │
│  ┊   Warden's grip. Elena holds a fragile   │
│  ┊   peace..."                         [✎]⚡│
│  ┊                                          │
│  ┊  Tensions:                               │
│  ┊  • "Kael's return has shattered the      │
│  ┊     peace — Elena is missing"       [✎]  │
│  ┊  • "The Warden's prison is failing" [✎]  │
│  ┊  ┄ resolved ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄    │
│  ┊  ✓ "The old king's loyalists are split"  │
│  ┊  [⚡ Add Tension]                         │
│  ┊                                          │
│  ┊  ATTG: [...................] ☐ → Memory  │
│  ┊  Style: [.................] ☐ → Auth Note│
│                                             │
│  ▸ Forge                                    │
│  ┊  ┌─────────────────────────────────┐     │
│  ┊  │ "Rivals for Kael who drink at   │     │
│  ┊  │  the Rusty Anchor"         [⚡] │     │
│  ┊  └─────────────────────────────────┘     │
│  ┊  [⚡ Forge from Brainstorm]              │
│  ┊                                          │
│  ┊  Batch: [Rusty Anchor Regulars    ]      │
│  ┊  ○ Serek — fixer, owes Kael              │
│  ┊  ○ Thalia — blind cartographer           │
│  ┊  ○ Brother Ash — heretic monk            │
│  ┊  ○ The Rusty Anchor — tavern             │
│  ┊  ○ Anchor Rats — regulars                │
│  ┊                                          │
│  ┊  [⚡ Cast All] [✕ Discard All]            │
│                                             │
│  ▸ Main (6 entities)              [⟲ Reforge]│
│  ┊  Kael — exile prince, blade-sworn        │
│  ┊  Elena — spymaster, Kael's sister        │
│  ┊  The Warden — immortal jailer            │
│  ┊  Thornveil Keep · The Sunken Market      │
│  ┊  Ashenmoor · The Gilt Court              │
│                                             │
│  ▸ Gilt Court's Inner Circle (3)  [⟲ Reforge]│
│  ┊  Lord Ashven — regent                    │
│  ┊  Lady Miren — chancellor                 │
│  ┊  The Privy Council — ruling faction      │
│                                             │
│  ▸ Story Opening                            │
│  ┊  [⚡ Bootstrap]  ☐ Include preamble       │
│                                             │
│  [Relationships] [Bind New] [Rebind]        │
│                                             │
└─────────────────────────────────────────────┘
```

### Lorebook Extension

```
Unmanaged Entry                    Managed Entry
┌────────────────────────┐  ┌──────────────────────────┐
│  "The Ashen Court"     │  │  "Kael" ◉ Live           │
│  ⚠ Not managed by SE   │  │                          │
│                        │  │  Relationships:           │
│  [⚡ Bind to SE]        │  │  → Elena — estranged     │
│  Category: [Factions]  │  │    siblings, blood oath   │
│  (cycle button)        │  │  → The Warden — captor/   │
│                        │  │    captive, escaped       │
│                        │  │  [+ Add Relationship]     │
│                        │  │                          │
│                        │  │  [⚡ Regen Content]       │
│                        │  │  [⚡ Regen Keys]          │
│                        │  │  Refine: [...] [⚡]       │
│                        │  │                          │
│                        │  │  [⟲ Reforge] [✕ Unbind]  │
└────────────────────────┘  └──────────────────────────┘
```

### Design Principles

**1. Entities are grouped by narrative batch, not by category.**

The forge produces holistic clusters (characters + locations + factions together). The UI groups by batch — "Main," "Rusty Anchor Regulars," "Gilt Court's Inner Circle." Category type (Character, Location, etc.) remains as metadata for SEGA and context building, but the display is by narrative cluster.

The first forge produces the **Main** batch. Every subsequent forge is an expansion pack with an auto-generated name (user-renamable).

**2. Forge and World are spatially separated.**

Forge (drafts) lives above World (committed). Draft entities are visible as the cluster they were generated as — not scattered across category sections. Cast moves entities down; Reforge moves them back up.

**3. Batch naming controls organization.**

The Forge has a `textInput` for the batch name (auto-generated, user-renamable). On Cast:
- Name matches an existing batch → entities merge into that batch
- New name → creates a new batch

This is the reorganization mechanism. Reforge entities, rename the batch, Cast into the target. No special "move" UI.

**4. Entity rows are single-line and scannable, with tap-to-expand actions.**

Entity rows are one line by default: name + short summary (engine-derived, read-only). Tapping a row expands a compact action bar underneath:

```
│  Kael — exile prince, blade-sworn                    │
│  ┊  [⟲ Reforge] [⚡ Regen] [↪ Move] [✕ Delete]      │
│  Elena — spymaster, Kael's sister                    │
│  The Warden — immortal jailer                        │
```

One tap to expand, one tap to act, collapses when another row is tapped. No navigation to the lorebook required for lifecycle actions — critical for mobile where the Lorebook Extension is many taps away.

The Lorebook Extension remains the surface for *deeper* per-entry work (relationships, refinement instructions, content preview, Bind/Unbind). But quick actions (Reforge, Regen, Move, Delete) are accessible directly in the Story Engine panel.

**Move** opens a modal to reassign the entity to a different batch directly — cleaner than the Reforge+rename+Cast flow for simple reorganization. Both paths work: Move for quick reassignment, Reforge when you want to regenerate in the context of a different batch.

**5. Forge is intent-driven, not category-driven.**

One Forge section with a text input for what the user needs. The forge generates a coherent cluster across whatever categories are needed. Three entry points:
- **Forge intent input** — type what you want, hit generate
- **Forge from Brainstorm** — uses recent chat context as the intent
- **Forge Around** (future) — expand the world around a specific entity

**6. Narrative Foundation contains all meta-level context.**

Everything that shapes generation but isn't a world entity:
- **Shape** — dramatic structure (TRAGEDY, MYSTERY, etc.)
- **Intent** — where the story is going (Direction successor)
- **World State** — where the story is now (Canon successor)
- **Tensions** — current narrative pressures
- **ATTG / Style** — genre/tone anchors with sync toggles

One collapsible section. These inform the forge, context builder, and every generation. They're not lorebook entries.

**7. Tensions are meta-context with a simple lifecycle.**

Two states: **active** and **resolved**. Three actions:
- **Edit** `[✎]` — rewrite to reflect what's happened. That's escalation — no special mechanic.
- **Resolve** `[✓]` — mark as addressed. Fades below a divider. No longer feeds context builder as active pressure. Informs the forge ("this was addressed, don't recreate it").
- **Add** `[⚡]` — new tension, manually or AI-generated.

This is retrospective, not predictive. The user tells the engine what's true *now*, not what should happen later.

**8. Relationships are on-demand, not persistent in the panel.**

Surfaced in two places:
- **Lorebook Extension** — per-entity editing (add, remove, modify)
- **Relationships modal** — whole-web overview via `[Relationships]` button

Relationships come from two sources:
- **The forge** — BUILD/LINK commands produce relationships as part of holistic generation. They persist through Cast as structured data.
- **The user** — manual add/edit via Lorebook Extension. Only source for bound (imported) entries.

SEGA's relational maps are eliminated. Relationships survive Cast as first-class data.

---

## Lorebook Sync

### Eventual Consistency

No `onLorebookEntryChanged` hook exists. Story Engine reconciles lazily:

1. **On `onBeforeContextBuild`** (every generation): diff managed entries against lorebook state. Primary reconciliation point.
2. **On `onLorebookEntrySelected`**: refresh the selected entry's state if managed.
3. **Deleted entries**: show `[⚠ Entry deleted from lorebook]` with options to recreate or unbind.
4. **Unmanaged entries**: remain unmanaged until explicitly Bound.

### Direction of Truth

- **Lorebook** is authoritative for content (text, keys).
- **Story Engine** is authoritative for structure (lifecycle, relationships, batch assignment, category).

### Bulk Bind

`[Bind New]` / `[Rebind]` buttons open a modal (`api.v1.ui.modal.open()`, size `"large"`):

```
┌─ Bind Lorebook Entries ─────────────────────┐
│                                              │
│  Found 12 unmanaged lorebook entries.        │
│                                              │
│  ☐ The Ashen Court          [Factions]       │
│  ☑ Commander Voss           [Characters]     │
│  ☑ The Bleeding Gate        [Locations]      │
│  ☐ Chronoflux Theory        [Systems]        │
│  ☑ Lady Miren               [Characters]     │
│  ☑ Southmarch               [Locations]      │
│  ...                                         │
│                                              │
│  [Bind Selected (4)]          [Cancel]       │
│                                              │
└──────────────────────────────────────────────┘
```

**Category auto-detection:** Pattern-match the `Type:` line common in NovelAI lorebook entries:
- `character`, `person`, `npc` → Characters
- `location`, `place`, `city`, `region` → Locations
- `faction`, `organization`, `group`, `guild` → Factions
- `system`, `magic`, `mechanic`, `rule` → Systems
- `narrative`, `dynamic`, `conflict` → Dynamics
- `species`, `race`, `creature`, `concept`, `lore`, `item`, `object` → Topics
- No `Type:` line or unrecognized → Topics (fallback)

Category selection uses a **cycle button** (no dropdown UIPart exists).

Bound entries go directly to Live in an "Imported" batch. The engine doesn't infer relationships for bound entries — the user adds them manually.

---

## User Flows

### New Story

1. User opens Brainstorm, riffs on ideas with the cowriter
2. Switches to the Story Engine panel
3. Clicks `[⚡ Forge from Brainstorm]` — forge reads brainstorm context, builds the **Main** batch (core characters, central locations, key factions/systems)
4. Main batch appears in the Forge section as a named cluster with relationships
5. User reviews, discards what doesn't fit, clicks `[⚡ Cast All]`
6. SEGA runs — lorebook content and keys generated
7. User clicks `[⚡ Bootstrap]` — story opener generated
8. User writes

### Mid-Story Expansion

1. User is 10 chapters in, wants to flesh out a tavern scene
2. Types "regulars and rivals for Kael at the Rusty Anchor" in the Forge intent input
3. Forge generates a named cluster ("Rusty Anchor Regulars"): characters, a location, a faction, relationships to existing entities
4. User reviews, discards one character, clicks `[⚡ Cast All]`
5. SEGA realizes new entities. Batch appears as "Rusty Anchor Regulars"

### Batch Expansion (Reforge)

1. User wants to add to the "Rusty Anchor Regulars" batch
2. Clicks `[⟲ Reforge]` on the batch header — batch lifts into the Forge
3. Types new intent: "a bartender who knows everyone's secrets"
4. Forge runs with awareness of existing batch members, produces new entities
5. User clicks `[⚡ Cast All]` — existing entities return unchanged, new entities get SEGA realization

### Entity Reorganization

1. User wants to move Lord Ashven from "Imported" to "Gilt Court's Inner Circle"
2. Taps Lord Ashven in the "Imported" batch — action bar expands: `[⟲ Reforge] [⚡ Regen] [↪ Move] [✕ Delete]`
3. Clicks `[↪ Move]` — modal opens listing available batches
4. Selects "Gilt Court's Inner Circle" — entity moves immediately, no regeneration needed

### Existing Story Adoption

1. User has 50 hand-written lorebook entries
2. Clicks `[Bind New]` — modal shows unmanaged entries with toggles and category cycle buttons
3. Selects 20 entries, adjusts categories where auto-detect was wrong
4. Clicks `[Bind Selected]` — entries appear as "Imported" batch
5. Adds relationships via Lorebook Extension
6. Engine generates Narrative State from bound entities + story text

---

## Open Questions

- **Context Curator:** The missing third layer. How does the engine actively manage what the AI sees during ongoing story generation? This is the piece that makes it a living engine. Needs its own design pass.
- **Relationship injection:** How are relationships surfaced to the AI during generation? Appended to lorebook entry text? Separate context block? Needs prototyping.
- **World State evolution:** When and how does World State get updated? User-triggered? Chapter boundaries? Automatic summarization? The mechanism matters for keeping it useful vs stale.
- **Bootstrap scope:** Is the current one-shot opener sufficient, or should Bootstrap be more substantial (Chapter One vs opening paragraph)?
- **Text Adventure mode:** Could Story Engine enhance TA mode — maintaining world state, tracking player location, managing NPC knowledge? Worth exploring but not v11 scope.
