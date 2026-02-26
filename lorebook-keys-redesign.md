# Lorebook Key Generation — Implementation Plan

## Background

The existing lorebook generation script runs on NovelAI's GLM-4.6 (355B parameter, Mixture of Experts, **untuned** instruct model). Because it is untuned, it responds better to few-shot example-driven prompts than to rule-based instruction prompts. Key generation is currently the weakest pass, producing generic, high-collision keys like full proper names, numbers, role descriptors, and thematic words that cause lorebook entries to activate too broadly or in the wrong direction.

---

## Core Design Principles

### Direction Rule
Keys must pull an entry into the narrative, not push it out.
- A **character entry** should activate when the story arrives at their domain. Keys should be their associated locations, factions, and name variants — not traits or roles.
- A **location entry** should activate when the story arrives there. Keys should be the location's own name variants and associated factions. Character names are a **last resort** only when the location has no distinctive proper name and is inseparable from specific occupants.
- A **faction/object entry** activates through its own name, associated locations, and key figures.

### Key Quality Rules
- Target **2–5 keys per entry** — fewer, better keys beat many weak ones.
- Permitted: name variants, nicknames, titles, epithets, regex for spelling variants, associated location names (for characters), faction/organization names.
- Banned: numbers or written-out numbers, roles and occupations, traits and descriptors, themes and abstract concepts, generic nouns valid in any scene, full multi-word names as a single key, the protagonist's name on any entry that isn't specifically about the protagonist.

### Collision Detection
After key generation, compare keys across all entries programmatically. Flag or reject keys that appear in more than N entries (threshold TBD) as likely high-collision generics. This is handled in script logic, not by the model.

---

## Revised Pipeline

The current three-pass pipeline:
1. Name + one-line description (stub entries)
2. Full entry expansion (prose entries)
3. Key generation (per entry, currently interleaved with pass 2)

### Revised four-pass pipeline:

**Pass 1 — Stub generation**
Unchanged. Produces name + one-line description for each entry.

**Pass 2 — Full entry expansion**
Unchanged. Produces full prose entries. Assigns the entry's own name as a **temporary placeholder key** — collision-prone but safe during construction since the lorebook is not being written against yet.

**Pass 3 — Relational map generation** *(new)*
Builds a structured relational map of the entire lorebook incrementally. This map is cached and reused until entries change.

### ⚠️ Critical: Isolated Per-Entry Mapping Will Produce Incomplete Results

**Do not process entries in isolation for the relational map.** A single entry rarely contains the full picture of its relationships. Relationships are established across multiple entries — a location entry may not name its occupants explicitly, but the character entries do. Processing entries one-at-a-time without cross-entry context produces an incomplete map and defeats the purpose of this pass.

The correct approach is **incremental map generation**:

1. **Sort entries by dependency order before processing:** characters first, then locations, then factions/objects. Characters are the most self-contained; locations and factions depend on knowing which characters are associated with them.

2. **Feed the growing map as context into each subsequent generation.** When processing a location entry, the prompt includes the map entries already produced for all characters. This allows the model to recognize that a generically-named location belongs to characters already in the map, and populate the relationship correctly.

3. **Run a reconciliation step after all entries are processed.** Scan the completed map for any location or faction entries where `primary characters` is empty and `collision risk` is flagged as high. These are candidates for back-reference errors — cases where the relationship exists in an earlier entry but wasn't surfaced during that entry's processing. Reconciliation can be a lightweight second prompt for just those flagged entries, or script logic that cross-references the full entry text.

### Relational Map Output Format (per entity)
```
[Entity Name] [type]
  - primary locations: ...
  - primary characters: ...
  - factions/organizations: ...
  - name is generic / distinctive: ...
  - collision risk: low / high
```

The map pass focuses on **extraction and structuring** of facts — base models handle extraction more reliably than rule-following. Cross-entry collision detection is handled programmatically after pass 4, not by the model.

### Incremental Map Prompt Structure

The prompt for each entry includes the map entries produced so far, followed by the new entry text, followed by a partial map entry for the model to complete:

```
[few-shot examples]

---

MAP SO FAR:
[all map entries generated so far]

---

ENTRY:
[full prose entry text for current entity]

[Entity Name] [type]
  - primary locations:
```

The prompt ends mid-completion so GLM-4.6 continues directly into structured output.

---

**Pass 4 — Key generation**
Per entry, consuming the relational map entry for that entity (not the raw prose). This gives the model clean structured input instead of atmospheric prose, making relationship-based key choices (e.g. using character names for a generically-named location) explicit rather than inferred.

---

## Prompt Strategy

Both the relational map prompt and the key generation prompt must use **few-shot example format** with inline reasoning, due to GLM-4.6 being an untuned base model. Do not use rule-lists or instruction blocks as the primary prompt structure — show the model exactly what correct output looks like.

### Relational Map Few-Shot Examples

Include 3 examples covering:
1. A character with a named home location and faction affiliation
2. A location with a distinctive proper name and explicit character occupants
3. A location with a generic name (e.g. "The Apartment") whose occupants are only established via character entries — demonstrating that `primary characters` is populated from the map context, not from the location entry text alone, and that `collision risk` is flagged high

### Key Generation Prompt Structure
```
ENTRY: [relational map entry]

REJECTED: [bad candidates] — [one-line reason]
KEYS: [final comma-separated keys]

---

ENTRY: [relational map entry]

REJECTED: [bad candidates] — [one-line reason]
KEYS: [final comma-separated keys]

---

ENTRY: [TARGET RELATIONAL MAP ENTRY]

REJECTED:
KEYS:
```

Include 2–3 examples demonstrating the Direction Rule asymmetry — particularly one example where character names are used as location keys because the location has a generic name and no other distinctive proper nouns.

---

## Caching Strategy

The relational map is an expensive pass (whole-lorebook context, processed incrementally). Cache it as a JSON or structured text artifact alongside the lorebook. Invalidate and regenerate only when entries are added, removed, or substantively edited. Placeholder keys from pass 2 remain active until pass 4 completes.

---

## Open Questions

- Collision threshold: how many entries can share a key before it is flagged? Needs calibration against a real lorebook.
- Whether the reconciliation step in pass 3 is best implemented as a second model prompt or as script logic cross-referencing raw entry text.
- Whether the relational map format needs further refinement after initial testing against real entries.