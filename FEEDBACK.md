# Story Engine v10 — SEGA Test Review

## About This Review

This document summarizes two structured user-simulation tests of the Story Engine v10 branch conducted on 2026-03-05. The goal was to evaluate the full pipeline from Brainstorm through SEGA lorebook generation, acting as a **novice writer with a vague, half-formed concept** — someone uncertain about their ideas who relies on the engine to scaffold and develop their creative vision.

Tests were conducted by a reviewer acting as user, with a human operator as hands. The reviewer dictated all inputs, evaluated all outputs, and flagged issues as they emerged. Between tests, the developer addressed bugs found in Test 1; Test 2 served as a regression check and further stress test.

Source branch under test: `v10` — https://github.com/keilladraconis/NAI-story-engine/tree/v10

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

## Test 2 — "Aethelburg" (Social Dystopia / Thriller)

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

Status codes reflect regression results from Test 2: ✅ Fixed, ⚠️ Partially fixed, ❌ Not fixed / persists, 🆕 New finding.

---

### 1. `crucible-build` truncation — continuation support needed ✅

**Severity: High** | **Status: Fixed (behavior changed)**

In Test 1, build pass 2 hit the 1024 `max_tokens` ceiling and the entire response was rolled back. In Test 2, the harness applied completed commands from the truncated pass and only discarded the incomplete CRITIQUE tail. This is the correct behavior — CRITIQUE is metadata, not world state.

However the 1024 token ceiling still causes truncation. The CRITIQUE in Test 2 Pass 1 was cut off mid-sentence, which means Pass 2 received an incomplete previous critique. This did not visibly degrade Pass 2 quality, but it is a latent risk as world complexity grows.

**Action:** Implement continuation support for `crucible-build` using `[DONE]` as the stop condition. This remains the clean fix even with the improved rollback behavior.

---

### 2. `field:canon` max_tokens too low ✅

**Severity: Medium** | **Status: Fixed**

Test 2 Canon was complete with no truncation. No further action needed.

---

### 3. Character template Age/Gender placeholders not filled ⚠️

**Severity: Medium** | **Status: Partially fixed**

In Test 2, Rhys (`8c6c7c1a`, Age: 42, Male) and Elara (`0e027f00`, Age: 26, Female) were filled correctly. Kaelen (`d43a27a6`) still shows `Age: [placeholder] | Gender: [placeholder]`. The fix is working for some characters but not others. Likely a context issue — Kaelen's age and gender are never stated explicitly in the Direction or brainstorm, while Rhys and Elara had implied ages. The prompt may need to instruct the model to make a reasonable inference when the information is absent rather than leaving the placeholder.

**Action:** Instruct the model to infer Age and Gender when not explicitly stated, or default to a sensible fallback (e.g., "unknown" or a reasonable estimate based on described appearance).

---

### 4. Faction template Members field not filled ❌

**Severity: Low** | **Status: Not verified in Test 2**

Test 2 did not produce a faction entry, so this could not be re-tested. Treat as unresolved.

**Action:** Either populate Members programmatically from the world state (characters whose relmap references the faction), or remove the field from the faction template.

---

### 5. Duplicate key sets generated for the same entry ❌

**Severity: Medium** | **Status: Not fixed**

Duplicates persist in Test 2. Examples:
- `lb-keys:8c6c7c1a` appears 2 times
- `lb-keys:7283d773` appears 3 times
- `lb-keys:75b80c60` appears 2 times
- `lb-keys:0e027f00` appears 2 times

**Action:** Deduplicate key sets per entry ID before writing to the lorebook. The final key set for each entry should be the union of all generated keys, with exact duplicates removed.

---

### 6. Malformed and overbroad regex in generated keys ❌

**Severity: Medium** | **Status: Not fixed**

Test 2 produced a new problematic key for Elara: `/el(a|ara)?/`. This matches any word containing "el" optionally followed by "a" or "ara" — it will trigger on "element," "else," "elbow," and countless other common words. It is so broad as to be useless. The plain keyword `elara` appears in the same key set, making the regex redundant as well as harmful.

The regex validation fix from Test 1 does not appear to be catching semantic overbreadth, only structural malformation.

**Action:** Expand key validation to flag and reject regex patterns that would match fewer than 4 characters without word boundary anchors. Consider adding `\b` boundary anchors to generated name regexes automatically, e.g. `/\belara\b/` rather than `/el(a|ara)?/`.

---

### 7. 🆕 Build pass world elements missing from SEGA lorebook

**Severity: High**

In Test 2, Resonance and the Echo Chamber — both created in build Pass 2 — do not appear as lorebook entries in the SEGA Digest. These are two of the most narratively significant elements in the world: Resonance is the mechanism for the climactic confrontation, and the Echo Chamber is the only location where it can safely occur. Both were properly visible in the world state display after the merge.

This suggests SEGA's lorebook generation stage is not iterating over all merged world elements, or the merge is not correctly transferring Pass 2 elements to the lorebook entry list.

A similar pattern may exist in Test 1 — the Weaver's Loom situation element and Resonant Salt system were created in Pass 3, and their lorebook entries should be audited to confirm they were present.

**Action:** Audit the merge-to-lorebook pipeline to confirm all world state elements, regardless of which build pass created them, are included in the SEGA lorebook generation run. Add a post-SEGA validation that compares world element count against generated lorebook entry count and surfaces a warning if they don't match.

---

### 8. 🆕 Relmap "primary characters" field appears inverted

**Severity: Low**

In Test 2, several relmaps list the wrong character as primary. The Kaelen relmap (`d43a27a6`) lists Rhys and Elara as primary characters — but this is Kaelen's own entry. The Elara relmap (`0e027f00`) lists Kaelen and Rhys as primary. The field appears to be listing the *other* characters most associated with the entry, rather than the entry's own subject.

This does not affect lorebook function but produces confusing Digest output and may affect downstream key generation quality if keys are being informed by relmap data.

**Action:** Clarify the intended semantics of the "primary characters" field in the relmap prompt, or rename it to "related characters" to better reflect what is actually being generated.

---

## Design Issues

---

### 9. Canon pipeline ordering creates name collision risk ✅ (mitigated by UX fix)

**Severity: Medium**

In Test 1 (first SEGA run with incorrectly populated lorebook), Canon invented "Elias" for the nephew, contradicting the world state's "Kaelen." The Bootstrap inherited "Elias," producing a lorebook/bootstrap name conflict invisible to the user.

Test 2 did not reproduce this because the merge was performed correctly. The pre-SEGA validation check added between tests prevented the silent failure mode. Treat as mitigated but not fully resolved — the underlying fragility (Canon relying on brainstorm context rather than structured world state) still exists.

**Remaining action:** Consider whether Canon should receive character names as a structured input in addition to the brainstorm, making it robust against partial context regardless of merge state.

---

### 10. Bootstrap POV is non-deterministic

**Severity: Low**

Test 1 (second run): Maret POV. Test 2: Elara POV. Both tests defaulted to the protagonist POV on the corrected run, which suggests the non-determinism from Test 1's first run (Kaelen POV) was an artifact of the missing world state rather than genuine randomness. The engine may be consistently choosing protagonist POV when properly contextualized, which is reasonable default behavior.

**Action:** Monitor across further tests. If protagonist POV is consistent when context is complete, this may be a non-issue. Document that Bootstrap is intentionally variable so users understand regenerating it is normal.

---

### 11. Build pass descriptions restate Direction rather than expand it ❌ (confirmed pattern)

**Severity: Low**

Confirmed in both tests. Pass 1 in both runs produced CREATE descriptions that were largely compressed paraphrases of Direction text. In Test 2, this was more pronounced because the Direction was richer — the engine had less whitespace to fill with invention.

Pass 2 in both tests showed genuine expansion once either user guidance or the self-critique pushed toward new elements.

**Action:** Add an explicit instruction to the build pass prompt: "Do not restate or paraphrase the Direction. Every element you CREATE must add information not already present in the Direction text."

---

### 12. Tension generation restates Direction rather than surfacing new pressures ❌ (confirmed pattern)

**Severity: Low**

Confirmed in both tests, more pronounced in Test 2 where the Direction was highly developed. All four Test 2 tensions were essentially named restatements of information already explicit in the Direction — Kaelen's concealed nature, Elara's credibility problem, the Serenity Mandate. None surfaced implied but unnamed pressures the way Test 1's Tension 3 (whale oil as finite resource) did.

The tension prompt currently has no instruction to avoid restating what is already explicit.

**Action:** Add an explicit instruction to the tension generation prompt: "Do not restate what is already named in the Direction. Surface pressures that are implied by the scenario but not yet explicitly described."

---

### 13. Late build pass critiques slide into plotting

**Severity: Low**

Confirmed in both tests. Silt-Fall Pass 3 CRITIQUE ended with "The next step would be to define the specific moment of the 'flicker' and its immediate consequences." Aethelburg Pass 2 CRITIQUE ended with "The path forward is clear: find the Echo Chamber, understand Resonance, and force Kaelen into a public broadcast of his true self." Both are story beat sequences, not world gap assessments.

This appears to be a consistent late-pass behavior: once the world feels complete, the engine starts reasoning about plot rather than world.

**Action:** Add an instruction to the CRITIQUE format: "Assess only what is missing or weak in the world as built. Do not describe story beats, plot sequences, or narrative trajectory."

---

### 14. Brainstorm wind-down responses are hollow

**Severity: Low**

Both tests ended the brainstorm with a generic affirmation: "Awesome. 'Unmake' is a powerful, chilling concept. I'm excited to see where you take it. What's next?" and "Awesome, that's a solid foundation... Go for it." These add no value and break the conversational tone the brainstorm otherwise maintains well.

**Action:** When the user signals they are done brainstorming, either generate no response (let the UI handle the transition) or generate a brief, specific callback to the most interesting idea from the session rather than a generic send-off.

---

## What Worked Well

These strengths held across both tests and should be preserved:

**Brainstorm quality is high.** The model behaves as a creative collaborator, not a question-asking assistant. Responses build on user ideas, escalate creatively ("unmake" was a genuine engine contribution, "weaponize her Blaze" reframed the protagonist's arc), and stay concise. The casual tone guidelines are being followed consistently.

**Direction extrapolation is strong.** Both Directions generated rich named elements from sparse brainstorm material: Silt-Fall, the Unmaking, the Keepers of the Quiet from a vague horror concept; Aethelburg, Greys/Chromatics/Blazes, the Serenity Mandate, Emotional Siphoning from a social premise with no named characters. The engine correctly invents what the scenario implies is already in motion.

**Shape detection is accurate.** Test 1 correctly invented a custom shape ("3-Body Problem") rather than forcing a bad preset fit. Test 2 correctly matched the preset "Climactic Choice" without over-inventing. Both calls were appropriate to the material.

**Build passes 2+ show genuine creative expansion.** The best elements across both tests came from pass 2 and 3 — Silent Geometry, Resonant Salt, Elara's loom, Resonance, the Echo Chamber, the First Silence. The engine adds meaningful new information when pushed past pass 1 transcription.

**Lorebook prose quality is high across both tests.** Character voice lines, conflict framings, and atmospheric descriptions are immediately usable by a writer. Standout entries include Maret's "The gauge does not lie. Everything else can be persuaded to forget," the Serenity Mandate's three-actor Motive Line breakdown, and the Lower Coil's "trade conducted in emotional currency."

**Key coverage is broadly correct.** Fuzzy name-matching regex is used appropriately for character names. Thematic entries have concept-based triggers. The relmap-informed generation is producing coherent topic and location keys.

**Partial command application on truncation is correct.** Test 2 confirmed that completed commands from a truncated build pass are now applied rather than rolled back entirely. This is the right behavior.

---

## Summary Severity Table

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | `crucible-build` needs continuation support | High | Bug | ✅ Improved |
| 2 | `field:canon` max_tokens too low | Medium | Bug | ✅ Fixed |
| 3 | Character Age/Gender placeholders not filled | Medium | Bug | ⚠️ Partial |
| 4 | Faction Members field not filled | Low | Bug | ❌ Unverified |
| 5 | Duplicate key sets per entry | Medium | Bug | ❌ Persists |
| 6 | Malformed/overbroad regex in generated keys | Medium | Bug | ❌ Persists |
| 7 | Build pass world elements missing from SEGA lorebook | High | Bug | 🆕 New |
| 8 | Relmap "primary characters" field appears inverted | Low | Bug | 🆕 New |
| 9 | Canon name collision risk from missing world state | Medium | Design | ✅ Mitigated |
| 10 | Bootstrap POV non-deterministic | Low | Design | ✅ Likely resolved |
| 11 | Build pass restates Direction instead of expanding | Low | Design | ❌ Confirmed |
| 12 | Tension generation restates Direction | Low | Design | ❌ Confirmed |
| 13 | Late build pass critiques slide into plotting | Low | Design | ❌ Confirmed |
| 14 | Brainstorm wind-down responses are hollow | Low | Design | ❌ Confirmed |