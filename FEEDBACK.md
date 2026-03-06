# Story Engine v10 — SEGA Test Review

## About This Review

This document summarizes five structured user-simulation tests of the Story Engine v10 branch conducted on 2026-03-05 and 2026-03-06. The goal was to evaluate the full pipeline from Brainstorm through SEGA lorebook generation, acting as a **novice writer with a vague, half-formed concept** — someone uncertain about their ideas who relies on the engine to scaffold and develop their creative vision.

Tests were conducted by a reviewer acting as user, with a human operator as hands. The reviewer dictated all inputs, evaluated all outputs, and flagged issues as they emerged. Between tests, the developer addressed bugs from prior runs; each subsequent test served as a regression check and further stress test.

Source branch under test: `v10` — https://github.com/keilladraconis/NAI-story-engine/tree/v10

**Important operational note:** Prompt fixes applied to the config require a "reset to defaults" step in the script configuration to take effect. Skipping this step produces misleading regression results. Test 3 (Silt-Haven) was invalidated for regression purposes because this step was missed; findings from that run are noted where relevant but not used for status assessments. Test 4 (Primrose Lane) is the definitive regression run for prompt-based fixes applied in Round 1. Test 5 (Anya Petrova) is the definitive regression run for Round 2 fixes (Issues 5, 6, 15, 16, 17).

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

## Test 5 — "Anya Petrova" (Literary Drama) — Round 2 regression run

**Starting concept:** A competitive eater who is about to retire. Not played for laughs — treated seriously. She's been the best in the world for ten years and her body is finally telling her it's over. The question is what it means to be the best at something nobody respects.

The brainstorm was kept to two exchanges. A mid-session correction was made: the model's wind-down response invented unapproved story content ("12:08," a unnamed rival, "inherited a curse") which contaminated the shape detection context. The response was deleted and the shape regenerated from the clean brainstorm. This is a new variant of Issue 14 — see below.

**Final world produced:** Anya Petrova, reigning champion, whose body is beginning to fail her by a margin only she can read. Jax Riley, social-media competitive eater who represents the sport's future. Lena Petrova, Anya's estranged sister and clinical dietitian. Sal, retired champion running a quiet deli. Key institutions: MLE Board (governing body suppressing athlete health data), OmniCorp Foods (primary sponsor maintaining a "Wellness Contingency Fund" for NDAs and off-books medical payments). Key systems: The Gastronome's Grind (oral tradition of self-harm training), The Glutton's Clock (judging system that rewards spectacle over mastery). Key locations: The Repeater's Motel (sterile recovery chain owned by an MLE shell corporation), The OmniSphere (OmniCorp's corporate venue, chrome and glass, a lie in architectural form).

**Pipeline stages:**
1. Brainstorm — 2 exchanges; wind-down response deleted before shape generation (see Issue 14 variant)
2. Crucible: Shape — correctly invented custom shape "The Long Goodbye" from clean context
3. Crucible: Direction — strongest of all five tests; rich extrapolation from minimal brainstorm
4. Crucible: Tensions — all four new, none restating Direction; Tension 2 (sponsor terror of health consequences) particularly strong
5. Crucible: Build World — 2 passes; Issue 15 fix confirmed (all Direction characters created correctly in Pass 1); Issue 16 fix confirmed (REVISE with type argument parsed successfully)
6. Merge to Story Engine
7. SEGA — full run; Issue 17 fix confirmed (Canon correctly labels shape as "The Long Goodbye")

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

### 5. Duplicate key sets generated for the same entry ⚠️

**Severity: Medium** | **Status: Partially fixed**

Test 4 duplicates were severe (DMZ: 4 sets, Sunflower Incident: 3, Clara: 3). Test 5 showed measurable improvement — most entries reduced to two sets — but the fix did not eliminate the problem. Entries with confirmed duplicates in Test 5: The Gastronome's Grind, Anya Petrova, Jax Riley, The Whispers in the Weigh-In, MLE Board, The Repeater's Motel, OmniCorp Foods, Lena Petrova, The Glutton's Clock. The stub-key removal is working (stub keys are no longer accumulating), but a second key generation run is still firing for most entries and being merged rather than deduplicated.

**Action:** Deduplicate key sets per entry ID before writing to the lorebook. The final key set for each entry should be the union of all generated keys, with exact duplicates removed. Investigate why the key generation stage is running twice per entry.

---

### 6. Malformed and overbroad regex in generated keys ⚠️

**Severity: Medium** | **Status: Partially fixed**

Test 5 confirmed the leading dash fix is mostly working but not complete: `- the repeater's motel` in `lb-keys:2dd3b0aa` survived the strip. The malformed regex (unclosed delimiter) from Test 4 did not reappear in Test 5.

Two new overbroad patterns identified in Test 5: `/any(a|ya)?/` in Anya's keys matches the common English word "any" (three characters, below the two-character test string threshold). `/len(a|na)?/` in Lena's keys matches "len" which appears in "length," "lend," etc. The heuristic test strings cover two-character matches but not three-character overbroad patterns.

**Action:** Raise the minimum-match-length check to cover three-character strings, or expand the test string set to include common three-character substrings (e.g., `["any", "the", "len", "ion", "ing", "ers"]`). Audit the leading dash strip for cases where the pattern fires before the dash rather than at the line start.

---

### 7. Build pass world elements missing from SEGA lorebook ✅

**Severity: High** | **Status: Fixed**

Test 4 confirmed all Pass 2 elements — Agnes, Eleanor, the Back Fence, the Garden of Passive Aggression — are present in the lorebook. Issue resolved.

---

### 8. Relmap "primary characters" field appears inverted ⚠️

**Severity: Low** | **Status: Partially fixed**

Test 4 showed mixed results. Test 5 confirmed the issue persists: `lb-relmap:bafec87a` (Anya's entry) lists Jax, Lena, and Sal as primary characters — those are the other characters, not the subject. `lb-relmap:61174700` (Jax's entry) lists Anya as primary. Some entries appear correct, others inverted. The behavior is inconsistent across entries within a single run.

**Action:** Clarify the intended semantics of the "primary characters" field in the relmap prompt, or rename it to "related characters" to better reflect what is actually being generated.

---

### 15. Direction characters not auto-created as world state elements ✅

**Severity: Medium** | **Status: Fixed**

Test 5 confirmed the fix. All Direction characters (Anya, Jax, Lena, Sal) were created as world state elements in Pass 1 without guidance. No orphaned LINK commands. The LINK auto-create stub approach is working and generalized — it handles any element type, not just Direction characters.

---

### 16. REVISE command fails silently with type argument ✅

**Severity: Medium** | **Status: Fixed**

Test 5 confirmed the fix. `[REVISE "Jax"]` (without type argument) parsed and executed successfully. The optional type argument regex was also verified: Jax's revision in Pass 2 produced the correct updated description. The unrecognized command warning was not tested directly but the parse failure mode that caused the original issue is resolved.

---

### 17. Canon structure label inconsistent with Crucible shape label ✅

**Severity: Medium** | **Status: Fixed**

Test 5 confirmed the fix. Canon correctly identified the shape as "The Long Goodbye" and reproduced its structural logic accurately: "the climax is not a dramatic loss but a moment of private, absolute acknowledgment of an ending that the world will never witness." No substitution from Canon's internal taxonomy. The shape injection is working.

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

**Severity: Low** | **Status: Partially fixed — new variant identified**

Test 3: "Got it. The kids trying to fix it makes it so much worse for her. It's like they're erasing her whole history. Let's move on. What's next?" — improved. The specific callback ("erasing her whole history") is genuine. "What's next?" still hollow.

Test 4: "Sounds like a great, solid foundation. Let's park that one and see what else is in your head. What's next?" — no improvement over Test 1.

**Test 5 — new variant:** When the user's final brainstorm message included "let's move to Crucible," the model did not produce a hollow wind-down — it produced an invented creative continuation: a specific competition timestamp ("12:08"), a named rival scene, and a thematic framing ("inherited a curse"). This content was entirely unapproved and contaminated the shape detection context, causing the shape detector to read invented material rather than the actual brainstorm. Deleting the response and regenerating shape from the clean context produced a measurably better shape call ("The Long Goodbye" vs. "Spiral Descent").

The wind-down fix must handle two distinct failure modes: (1) generic hollow send-off when the user signals completion, and (2) creative continuation when the user uses a navigation phrase like "let's move to Crucible." In both cases the engine should either stay silent or produce a minimal, non-generative acknowledgment, and must not generate new story content that hasn't been approved.

**Action:** Detect navigation phrases ("let's move on," "let's go to Crucible," "that's enough," etc.) and suppress all generative response. A brief non-creative acknowledgment is acceptable; anything that invents story content is not. The UI handles the transition.

---

## What Worked Well

These strengths held across all five tests and should be preserved:

**Brainstorm quality is high.** The model behaves as a creative collaborator, not a question-asking assistant. Responses escalate creatively — "unmake," "weaponize her Blaze," "this body is the best thing that's happened to him in years," "she's not grieving the person, she's grieving the hate," "the tragedy of being a queen in a kingdom of jokes" were all genuine engine contributions that sharpened the user's concept. The casual tone guidelines are being followed consistently.

**Direction extrapolation is strong and improving.** All five Directions generated richly named worlds from sparse material. Test 5 (Anya Petrova) produced the strongest Direction of the series from a two-exchange brainstorm — the engine invented Sal's esophageal-tear backstory, the Repeater's Motel as MLE-owned recovery infrastructure, and the OmniCorp "Wellness Contingency Fund" without any of these being in the brainstorm. The closing line — "measuring a life in hot dogs and trying to find a new unit of measurement before the clock runs out" — is the best Direction closing of any test.

**Shape detection is accurate and improving.** Test 1 correctly invented a custom shape. Test 2 correctly matched a preset. Test 3 invented a new shape for ensemble material. Test 4 matched a preset. Test 5 invented "The Long Goodbye" — and the clean brainstorm context (after the contaminating wind-down response was deleted) produced a more precise shape than the first attempt would have. The detector is responsive to context quality.

**Build pass quality improves with each pass.** The self-directed refinement loop is working. Pass 2 CRITIQUEs correctly identify specific gaps, and subsequent passes deliver what was asked for. Test 5 Pass 1 CRITIQUE correctly identified that the corporate sponsor layer and the judging system were missing as distinct elements — Pass 2 delivered OmniCorp Foods and The Glutton's Clock exactly as flagged.

**Lorebook prose quality is high and consistent.** Across all five tests, character voice lines, conflict framings, and atmospheric descriptions are immediately usable. Test 5 standouts: Anya's "the body keeps a perfect account — you just have to learn to read the ledger," the Repeater's Motel ice machine alcove where nods are exchanged "like passwords," and the OmniSphere as "a lie in architectural form." Sal's buried esophageal tear and the deli as "quiet penance" is the strongest character backstory of the series.

**Multi-actor topic and situation entries are a genuine strength.** When the lorebook generator produces entries with multiple actor perspectives, the perspectives are consistently differentiated, non-redundant, and reveal character through their position on the shared subject. Test 5's Champion's Paradox entry — Anya lives it, Jax exploits it, Lena pathologizes it, Sal pays for it — is the cleanest four-actor differentiation of any test.

---

## Summary Severity Table

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | `crucible-build` needs continuation support | High | Bug | ✅ Improved |
| 2 | `field:canon` max_tokens too low | Medium | Bug | ✅ Fixed |
| 3 | Character Age/Gender placeholders not filled | Medium | Bug | ✅ Fixed |
| 4 | Faction Members field not filled | Low | Bug | ⚠️ Partial |
| 5 | Duplicate key sets per entry | Medium | Bug | ⚠️ Partial |
| 6 | Malformed regex / leading dash artifacts in keys | Medium | Bug | ⚠️ Partial |
| 7 | Build pass world elements missing from SEGA lorebook | High | Bug | ✅ Fixed |
| 8 | Relmap "primary characters" field inverted | Low | Bug | ⚠️ Partial |
| 9 | Canon name collision risk from missing world state | Medium | Design | ✅ Mitigated |
| 10 | Bootstrap POV non-deterministic | Low | Design | ✅ Resolved |
| 11 | Build pass restates Direction instead of expanding | Low | Design | ✅ Fixed |
| 12 | Tension generation restates Direction | Low | Design | ✅ Fixed |
| 13 | Late build pass critiques slide into plotting | Low | Design | ✅ Fixed |
| 14 | Brainstorm wind-down responses are hollow | Low | Design | ⚠️ Partial |
| 15 | Direction characters not auto-created as world state elements | Medium | Bug | ✅ Fixed |
| 16 | REVISE command fails silently with type argument | Medium | Bug | ✅ Fixed |
| 17 | Canon structure label inconsistent with Crucible shape | Medium | Bug | ✅ Fixed |