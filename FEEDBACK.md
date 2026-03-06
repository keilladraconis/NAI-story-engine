# Story Engine v10 — SEGA Test Review

## About This Review

This document summarizes four structured user-simulation tests of the Story Engine v10 branch conducted on 2026-03-05 and 2026-03-06. The goal was to evaluate the full pipeline from Brainstorm through SEGA lorebook generation, acting as a **novice writer with a vague, half-formed concept** — someone uncertain about their ideas who relies on the engine to scaffold and develop their creative vision.

Tests were conducted by a reviewer acting as user, with a human operator as hands. The reviewer dictated all inputs, evaluated all outputs, and flagged issues as they emerged. Between tests, the developer addressed bugs from prior runs; each subsequent test served as a regression check and further stress test.

Source branch under test: `v10` — https://github.com/keilladraconis/NAI-story-engine/tree/v10

**Important operational note:** Prompt fixes applied to the config require a "reset to defaults" step in the script configuration to take effect. Skipping this step produces misleading regression results. Test 3 (Silt-Haven) was invalidated for regression purposes because this step was missed; findings from that run are noted where relevant but not used for status assessments. Test 4 (Primrose Lane) is the definitive regression run for all prompt-based fixes.

---

## Test 1 — "Silt-Fall" (Quiet Horror)

**Starting concept:** A dying inland port town where the sea has receded. A woman maintains a lighthouse that no longer guides ships — possibly as a ward against something. A stranger arrives to convince her to leave.

The concept was deliberately vague and incomplete, with no named characters, no defined antagonist, and no clear conflict.

**Final world produced:** Silt-Fall, a dead port city under threat from "the Unmaking" — a passive anti-force eroding existence from the fossilized salt flats of the former seabed. Maret, the Spire Keeper, maintains the only ward against it. Her nephew Kaelen, an urban cartographer, arrives to convince her to leave, his rational skepticism destabilizing the ward's equilibrium. Supporting characters: Old Finn (town historian), Elara (weaver who channels the Unmaking's dread into geometric tapestries).

**Pipeline stages:**
1. Brainstorm — 5 exchanges
2. Crucible: Shape — auto-generated (invented custom shape: "3-Body Problem")
3. Crucible: Direction — auto-generated
4. Crucible: Tensions — 4 tensions, all accepted
5. Crucible: Build World — 3 passes (pass 2 failed on first attempt due to truncation)
6. Merge to Story Engine — required a redo due to operator error on first attempt
7. SEGA — full run; ATTG, Style, Canon, Bootstrap, Lorebook content, Relmaps, Keys

---

## Test 3 — "Silt-Haven" (Folk Horror / Ensemble) — Invalidated for regression

**Starting concept:** A fishing village where a body washes ashore. Not a murder mystery — the question is what the community does with it, and how it tears itself apart deciding.

**Note:** Prompt fixes were not active during this run due to the config reset step being missed. Creative output observations are valid; regression status findings are not.

**Final world produced:** Silt-Haven, an isolated fishing village. Finn Locke (head fisherman) wants the body sunk to protect illegal operations. Elara Vetch (pub/store owner) wants to report it as leverage over the fishermen's debts. Father Thorne (priest) exploits the crisis to reassert waning influence. Maeve (cannery worker) is the sole figure trying to identify the dead man. Key elements: the Tide-Worn Logbook (a debt record found on the corpse, fought over by all factions), the Leviathan's Shadow (industrial trawler threatening the village's livelihood), the Last Bus Stop (physical monument to the youth exodus).

**Pipeline stages:**
1. Brainstorm — 5 exchanges
2. Crucible: Shape — auto-generated (invented: "Pressure Cooker")
3. Crucible: Direction — auto-generated (strongest Direction of all four tests)
4. Crucible: Tensions — 4 tensions, all accepted
5. Crucible: Build World — 3 passes, all clean
6. Merge to Story Engine
7. SEGA — full run

---

## Test 4 — "Primrose Lane" (Literary Fiction) — Primary regression run

**Starting concept:** Two old women who have been neighbors for forty years and hate each other. One is dying. The surviving neighbor has to figure out what she feels about it.

The shortest brainstorm of all four tests (3 exchanges), deliberately testing whether a thin brainstorm still produces a rich Direction.

**Final world produced:** Agnes (retired archivist) and Eleanor (retired horticulturalist), neighbors in a suburban duplex on Primrose Lane. Agnes's identity is built entirely on forty years of meticulously documented slights. Eleanor is dying, her final act of passive victory. Their children — Mark (financial advisor, Agnes's son) and Clara (hospice nurse, Eleanor's daughter) — keep trying to engineer reconciliation, which Agnes experiences as erasure. Key elements: the Archive of Grievances (Agnes's fireproof filing cabinet of documented infractions), the Garden of Passive Aggression (Eleanor's living counterpoint), the Demilitarized Zone (the shared strip of wilting lawn), the Neighborhood Watch (a social club that treats the feud as local color and maintains a "Chronicle of the Lane").

**Pipeline stages:**
1. Brainstorm — 3 exchanges
2. Crucible: Shape — correctly matched preset "Spiral Descent"
3. Crucible: Direction — auto-generated
4. Crucible: Tensions — 4 tensions, all accepted; prompt fix measurably improved quality
5. Crucible: Build World — 2 passes; Pass 1 failed to CREATE Agnes and Eleanor as world elements (orphaned LINK commands); Pass 2 added them via guidance
6. Merge to Story Engine
7. SEGA — full run

**Starting concept:** A city where everyone's emotions are visible as involuntary auras. A social hierarchy built on emotional control. A protagonist who feels too much and sees too clearly.

The concept was more developed than Test 1 by the end of Brainstorm, with genre, protagonist, antagonist, and core conflict all roughed in. This tested the engine against a Direction-rich scenario where tension generation and build passes had less room to invent.

**Final world produced:** Aethelburg, a city stratified by aura control — Greys at the apex, Blazes in the slums of the Lower Coil. Elara, a hypersensitive Blaze, witnesses the Grey Arbiter Kaelen's concealed predatory malice. Kaelen secretly harvests suppressed emotions ("Emotional Siphoning") and is pushing the Serenity Mandate to forcibly exile Blazes. Rhys, a disgraced journalist, is Elara's potential ally. Key world mechanisms: Resonance (aura synchronization as weapon), the Echo Chamber (location enabling controlled Resonance), the First Silence (suppressed founding history).

**Pipeline stages:**
1. Brainstorm — 6 exchanges
2. Crucible: Shape — auto-generated (correctly matched preset: "Climactic Choice")
3. Crucible: Direction — auto-generated
4. Crucible: Tensions — 4 tensions, all accepted
5. Crucible: Build World — 2 passes (pass 1 truncated but partial commands applied)
6. Merge to Story Engine
7. SEGA — full run

---

## Bugs

Status codes reflect regression results across all four tests. Test 4 (Primrose Lane, 2026-03-06) is the definitive regression run. ✅ Fixed, ⚠️ Partially fixed, ❌ Not fixed / persists, 🆕 New finding.

---

### 1. `crucible-build` truncation — continuation support needed ✅

**Severity: High** | **Status: Improved; full fix still needed**

In Test 1, build pass 2 hit the 1024 `max_tokens` ceiling and the entire response was rolled back. In Tests 2–4, the harness correctly applies completed commands from a truncated pass and only discards the incomplete CRITIQUE tail. This is the right behavior — CRITIQUE is metadata, not world state.

However the 1024 token ceiling still causes CRITIQUE truncation. Pass 1 in Test 2 was cut off mid-sentence; this did not visibly degrade Pass 2 quality but is a latent risk as world complexity grows.

**Action:** Implement continuation support for `crucible-build` using `[DONE]` as the stop condition. This remains the clean fix even with the improved rollback behavior.

---

### 2. `field:canon` max_tokens too low ✅

**Severity: Medium** | **Status: Fixed**

Test 2 Canon was complete with no truncation. No further action needed.

---

### 3. Character template Age/Gender placeholders not filled ✅

**Severity: Medium** | **Status: Fixed**

Test 4 confirmed all character entries are correctly filled: Agnes (78, Female), Eleanor (82, Female), Mark (48, Male), Clara (42, Female). The fix is working consistently. Kaelen's unfilled placeholders in Test 2 appear to have been a context issue — the Direction never stated his age or gender explicitly. The inference instruction is working.

---

### 4. Faction template Members field not filled ⚠️

**Severity: Low** | **Status: Partially fixed**

Test 4 produced a faction entry (The Neighborhood Watch, `fd545471`) with `Leader: Brenda` correctly filled but no Members list. The Leader field being populated is an improvement over Test 1's entirely blank fields. Members remains unfilled.

**Action:** Either populate Members programmatically from the world state (characters whose relmap references the faction), or remove the field from the faction template.

---

### 5. Duplicate key sets generated for the same entry ❌

**Severity: Medium** | **Status: Not fixed**

Duplicates persist in Test 4 and are worse than previous tests. The DMZ entry (`8c095441`) has four separate key sets. The Sunflower Incident (`4c671484`) has three. Clara (`b08c0c7b`) has three. Eleanor (`417f2968`), the Archive (`4febc6f4`), the Garden (`c6fb97be`), and the Casserole (`3623c143`) each have two.

**Action:** Deduplicate key sets per entry ID before writing to the lorebook. The final key set for each entry should be the union of all generated keys, with exact duplicates removed.

---

### 6. Malformed and overbroad regex in generated keys ❌

**Severity: Medium** | **Status: Not fixed**

Test 4 produced a broken Clara key: `/clar(a|ra)?, the demilitarized zone, the back fence, the neighborhood watch` — the regex is missing its closing `/` and the remainder of the line has been swallowed into the pattern. This is the same class of structural malformation as Test 1.

Additionally, leading dash artifacts persist in plain keyword entries: `- archive of grievances`, `- sunflower incident`, `- unwanted casserole`. These appear to be priming fragment artifacts not caught by the existing fix.

**Action:** Regex validation must check for matching opening and closing `/` delimiters before writing. Strip leading dash characters from plain keyword entries. Consider adding `\b` word boundary anchors to all name-matching regex patterns to prevent overbroad matching.

---

### 7. Build pass world elements missing from SEGA lorebook ✅

**Severity: High** | **Status: Fixed**

Test 4 confirmed all Pass 2 elements — Agnes, Eleanor, the Back Fence, the Garden of Passive Aggression — are present in the lorebook. Issue resolved.

---

### 8. Relmap "primary characters" field appears inverted ⚠️

**Severity: Low** | **Status: Partially fixed**

Test 4 shows mixed results. Mark's relmap correctly lists Agnes as primary. The Agnes relmap lists "none named" — inverted. Eleanor's relmap lists Clara — inverted. Inconsistent behavior persists.

**Action:** Clarify the intended semantics of the "primary characters" field in the relmap prompt, or rename it to "related characters" to better reflect what is actually being generated.

---

### 15. 🆕 Direction characters not auto-created as world state elements

**Severity: Medium**

In Test 4, Agnes and Eleanor were named in the Direction but not present in the world state before build Pass 1. The engine created LINK commands referencing them, but since they had no world state entries, all links to Agnes and Eleanor from Pass 1 were silently dropped. This required the user to notice the problem and provide explicit guidance in Pass 2 to CREATE them.

Named characters in the Direction are canonical — they should exist as world state entries automatically before the first build pass runs.

**Action:** After Direction is generated and before the first build pass, auto-populate the world state with stub entries for all named characters in the Direction. Stubs can be minimal (name only) and overwritten by explicit CREATE commands in subsequent passes.

---

### 16. 🆕 REVISE command fails silently when type argument is included

**Severity: Medium**

In Test 4 Pass 2, the engine generated `[REVISE "FACTION" "The Neighborhood Watch"]`, mirroring the CREATE command's type-argument syntax. The harness silently dropped the command rather than applying the revision or surfacing an error. The Neighborhood Watch lorebook entry retained its thin Pass 1 description, losing the Chronicle of the Lane and all other Pass 2 revisions.

Two issues: the engine overgeneralizing CREATE syntax onto REVISE, and the harness failing silently on a parse error rather than logging it.

**Action:** Strip or ignore unexpected type arguments in REVISE parsing so the command succeeds regardless. Surface a warning in the command log whenever a parse error occurs so failures are visible to the user.

---

### 17. 🆕 Canon structure label inconsistent with Crucible shape label

**Severity: Medium**

In Tests 3 and 4, the Canon field's Structure section labels the story with a different shape than Crucible detected. Test 4 had Spiral Descent as its Crucible shape; Canon labeled it "Pressure Cooker" — a different story's shape applied to the wrong world. This is a consistent mislabeling pattern across at least two runs.

Canon appears to be drawing structure labels from its own internal taxonomy rather than passing through the Crucible shape name.

**Action:** Pass the Crucible shape name and description explicitly to the Canon generation prompt so the Structure section reflects the correct shape. The shape description should be included so the structural analysis reflects the actual shape logic, not a generic substitute.

---

## Design Issues

---

### 9. Canon pipeline ordering creates name collision risk ✅ (mitigated by UX fix)

**Severity: Medium**

In Test 1 (first SEGA run with incorrectly populated lorebook), Canon invented "Elias" for the nephew, contradicting the world state's "Kaelen." The Bootstrap inherited "Elias," producing a lorebook/bootstrap name conflict invisible to the user.

Tests 2–4 did not reproduce this because merges were performed correctly. The pre-SEGA validation check prevents the silent failure mode. Treat as mitigated but not fully resolved — the underlying fragility (Canon relying on brainstorm context rather than structured world state) still exists.

**Remaining action:** Consider whether Canon should receive character names as a structured input in addition to the brainstorm, making it robust against partial context regardless of merge state.

---

### 10. Bootstrap POV is non-deterministic ✅ (resolved)

**Severity: Low**

Tests 2–4 all defaulted to the protagonist POV when context was complete (Elara, Elara, Agnes respectively). The non-determinism from Test 1's first run appears to have been an artifact of the missing world state. Protagonist POV is consistent when the pipeline runs correctly. No action needed.

---

### 11. Build pass descriptions restate Direction rather than expand it ✅

**Severity: Low** | **Status: Fixed**

Test 4 Pass 1 produced genuinely new information not present in the Direction: the Archive as a fireproof filing cabinet with soil sample analyses, the Sunflower Incident of '98 as a named founding myth with a specific consequence chain (three years of soil acidification), Clara as a hospice nurse. The prompt fix is working.

---

### 12. Tension generation restates Direction rather than surfacing new pressures ✅

**Severity: Low** | **Status: Fixed**

Test 4 tensions showed measurable improvement. Tension 1 (neighborhood's performative neighborliness code) was genuinely new information. Tension 4 (property line as sacred border, its erasure as ontological threat) surfaced an implied ticking clock — what happens to the shared lawn when Eleanor dies — that the Direction never named. The prompt fix is working.

---

### 13. Late build pass critiques slide into plotting ✅

**Severity: Low** | **Status: Fixed**

Tests 3 and 4 CRITIQUEs stayed focused on world gaps throughout all passes. Test 4 Pass 2 CRITIQUE assessed structural balance and missing counterpoints without describing any story beats. The prompt fix is working.

---

### 14. Brainstorm wind-down responses are hollow ⚠️

**Severity: Low** | **Status: Partially fixed**

Test 3: "Got it. The kids trying to fix it makes it so much worse for her. It's like they're erasing her whole history. Let's move on. What's next?" — improved. The specific callback ("erasing her whole history") is genuine. "What's next?" still hollow.

Test 4: "Sounds like a great, solid foundation. Let's park that one and see what else is in your head. What's next?" — no improvement over Test 1.

The fix is inconsistent — sometimes the engine produces a specific callback, sometimes it defaults to a generic send-off.

**Action:** When the user signals they are done brainstorming, generate a brief, specific callback to the most interesting idea from the session. Suppress the "What's next?" prompt entirely — the UI handles the transition.

---

## What Worked Well

These strengths held across all four tests and should be preserved:

**Brainstorm quality is high.** The model behaves as a creative collaborator, not a question-asking assistant. Responses escalate creatively — "unmake," "weaponize her Blaze," "this body is the best thing that's happened to him in years," "she's not grieving the person, she's grieving the hate" were all genuine engine contributions that sharpened the user's concept. The casual tone guidelines are being followed consistently.

**Direction extrapolation is strong and improving.** All four Directions generated richly named worlds from sparse material. Test 4 (Primrose Lane) produced the strongest Direction of the series from the shortest brainstorm — three exchanges yielding Agnes as a retired archivist, Eleanor as a horticulturalist, Primrose Lane, the Archive, the demilitarized zone strip, the founding myth of the hedge trimmer. The engine correctly invents what the scenario implies is already in motion.

**Shape detection is accurate.** Test 1 correctly invented a custom shape. Test 2 correctly matched a preset. Test 3 correctly invented a new shape for ensemble material. Test 4 correctly matched Spiral Descent — the most precise shape call of the series, with a description that correctly named the story's structural logic.

**Build pass quality improves with each pass.** The self-directed refinement loop is working. Pass 2 CRITIQUEs in Tests 3 and 4 correctly identified specific gaps (the conflict needs a totem; the world is too Agnes-centric), and Pass 3/Pass 2 respectively delivered exactly what was asked for. The Tide-Worn Logbook and the Garden of Passive Aggression are both strong examples of the engine adding genuinely load-bearing elements not present in the Direction.

**Lorebook prose quality is high and consistent.** Across all four tests, character voice lines, conflict framings, and atmospheric descriptions are immediately usable. Standout entries include Eleanor's "A garden's most beautiful moment is the one just before it's entirely gone," the Silt-Haven Tidal Pool's "a stage where the sea presents its evidence," Maeve's "A thing has a name, or it doesn't exist," and the Salt-Scribe Pub's "a panopticon of poverty."

**Multi-actor topic and situation entries are a genuine strength.** When the lorebook generator produces entries with multiple actor perspectives (The Curse of the Sea in Test 3, The Outsider's Corpse and The Sunflower Incident in Test 4), the perspectives are consistently differentiated, non-redundant, and reveal character through their position on the shared subject rather than through description.

**Key regex is improving.** Test 4 introduced `/sunflower.*incident/` — a flexible pattern that anticipates varied word order — and consistent use of word-boundary-aware patterns for character names. The quality of regex generation is trending upward even as the deduplication bug persists.

---

## Summary Severity Table

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | `crucible-build` needs continuation support | High | Bug | ✅ Improved |
| 2 | `field:canon` max_tokens too low | Medium | Bug | ✅ Fixed |
| 3 | Character Age/Gender placeholders not filled | Medium | Bug | ✅ Fixed |
| 4 | Faction Members field not filled | Low | Bug | ⚠️ Partial |
| 5 | Duplicate key sets per entry | Medium | Bug | ❌ Persists |
| 6 | Malformed regex / leading dash artifacts in keys | Medium | Bug | ❌ Persists |
| 7 | Build pass world elements missing from SEGA lorebook | High | Bug | ✅ Fixed |
| 8 | Relmap "primary characters" field inverted | Low | Bug | ⚠️ Partial |
| 9 | Canon name collision risk from missing world state | Medium | Design | ✅ Mitigated |
| 10 | Bootstrap POV non-deterministic | Low | Design | ✅ Resolved |
| 11 | Build pass restates Direction instead of expanding | Low | Design | ✅ Fixed |
| 12 | Tension generation restates Direction | Low | Design | ✅ Fixed |
| 13 | Late build pass critiques slide into plotting | Low | Design | ✅ Fixed |
| 14 | Brainstorm wind-down responses are hollow | Low | Design | ⚠️ Partial |
| 15 | Direction characters not auto-created as world state elements | Medium | Bug | 🆕 New |
| 16 | REVISE command fails silently with type argument | Medium | Bug | 🆕 New |
| 17 | Canon structure label inconsistent with Crucible shape | Medium | Bug | 🆕 New |