# Story Engine v10 — SEGA Test Review

## About This Review

This document tracks open and recently resolved issues from six structured user-simulation tests of the Story Engine v10 branch. Tests were conducted by a reviewer acting as user, with a human operator as hands, evaluating the full pipeline from Brainstorm through SEGA lorebook generation.

Source branch: `v10` — https://github.com/keilladraconis/NAI-story-engine/tree/v10

**Operational note:** Prompt fixes require a "reset to defaults" step in script configuration to take effect. Test 3 (Silt-Haven) was invalidated for regression purposes because this step was missed. Test 4 (Primrose Lane) is the definitive regression run for Round 1 fixes. Test 5 (Anya Petrova) is the definitive regression run for Round 2 fixes. Test 6 (Oren's Reach) is the definitive regression run for Round 3 fixes.

---

## Test History

| # | Name | Genre | Brainstorm | Shape | Notes |
|---|------|-------|-----------|-------|-------|
| 1 | Silt-Fall | Quiet Horror | 5 exchanges | Custom: "3-Body Problem" | First run; baseline bugs identified |
| 2 | Aethelburg | Speculative Fiction | 6 exchanges | Preset: Climactic Choice | Round 1 fixes first applied |
| 3 | Silt-Haven | Folk Horror | 5 exchanges | Custom: "Pressure Cooker" | **Invalidated** — config reset missed |
| 4 | Primrose Lane | Literary Fiction | 3 exchanges | Preset: Spiral Descent | Round 1 definitive regression run |
| 5 | Anya Petrova | Literary Drama | 2 exchanges | Custom: "The Long Goodbye" | Round 2 definitive regression run |
| 6 | Oren's Reach | Grimdark Fantasy | 5 exchanges (Cowriter + Critic) | Preset: Climactic Choice | Round 3 definitive regression run; first Critic mode test |

---

## Open Issues

---

### 1. `crucible-build` continuation support needed ✅ Improved / still open

**Severity: High**

Partial commands from truncated passes are now applied correctly and only the CRITIQUE tail is discarded. This is the right behavior. The 1024 token ceiling still causes CRITIQUE truncation in complex worlds, which is a latent risk as world complexity grows.

**Action:** Implement continuation support using `[DONE]` as the stop condition.

---

### 4. Faction Members field not filled 🚫 Not reproducible

**Severity: Low**

Leader field now fills correctly. Members field was blank in tests but this appears to be a phantom artefact of a failed test run rather than a consistent model behaviour. Closing as not reproducible.

---

### 5. Duplicate key and relmap sets per entry ✅ Fixed in Round 4

**Severity: Medium**

Round 2's `keysCompleted` flag reduced key duplicates in Test 5. Test 6 is significantly worse: `aa3bccf8` (Fever of the Walls) has four key sets — three identical `- fever of the walls` entries plus a fourth. `4231c10b` (Loyalists) has six key sets. `5e5b60a0` (Granary Silo) has three. The `keysCompleted` flag dispatch was happening AFTER async lorebook API awaits, creating a race window where `scheduleNextSegaTask` (triggered by `requestCompleted` + 100ms sleep) could re-queue an entry before the flag was visible in state.

Additionally, Test 6 shows the same re-queue problem now affecting **relmaps**: all eleven entries had two complete relmap blocks. The re-queue vulnerability was not addressed in the relmap pipeline.

**Fix:** Moved `keysCompleted` and new `relmapsCompleted` dispatches to the top of each completion handler, before any `await`. This ensures the flag is in state well before the 100ms sleep + `scheduleNextSegaTask` sees it. Added `relmapsCompleted` guard to `findEntryNeedingRelationalMap` symmetrically with the existing `keysCompleted` guard.

---

### 6. Leading dash artifacts in generated keys ✅ Fixed in Round 4

**Severity: Medium**

The overbroad regex fixes from Round 3 are confirmed working — no fragmentary name patterns, no unclosed delimiters, `/i` flags present on regex keys, compound `&` keys appearing correctly. The leading dash strip was failing for two reasons: (1) when the LLM uses a multi-line `KEYS:` format (header line + one key per subsequent line), the parser only read the empty header line and returned `[]`, leaving the stub key and triggering re-queue; (2) the strip only matched ASCII hyphen, not en-dash, em-dash, or bullet characters the model sometimes outputs.

**Fix:** Rewrote `parseLorebookKeys` to detect the multi-line format (collect bullet lines after a `KEYS:` header with no inline content) and widened the strip character class to `[\-\u2013\u2014\u2022*]`.

---

### 8. Relmap self-reference ✅ Fixed in Round 4

**Severity: Low**

The rename from "primary characters" to "related characters" (Round 3) is confirmed working. Two remaining problems resolved:

1. **Self-reference:** Several entries list the entry's own subject in the related characters field. `lb-relmap:c376c8a6` (The Physician's entry) lists "The Physician (as its operator)." Circular references add no information. Fixed by adding an explicit RULE to the relational map prompt: "Do not list the entry's own subject in the related characters field."

2. **Duplicate relmap runs:** See Issue 5 — fixed via `relmapsCompleted` flag.

---

### 17. Canon structure label wrong + Canon contradicts Direction ✅ Fixed in Round 4

**Severity: Medium**

Confirmed fixed in Test 5 ("The Long Goodbye" correctly passed through). Confirmed broken again in Test 6: Canon labels the structure "Pressure Cooker" despite the Crucible shape being "Climactic Choice." The shape injection introduced in Round 2 is not holding. Root cause: in Test 6, `state.crucible.shape` was null (or the shape was set after Canon ran), so no `[NARRATIVE SHAPE — REQUIRED]` message was injected and the model freely chose from the preset fallback list.

Additionally, Test 6 Canon described Kaelen as a "delusional commander" despite the Direction explicitly stating otherwise. Canon was weighting the brainstorm's early exchange over the Direction's correction.

**Fix:** Strengthened `createCanonFactory` in `context-builder.ts`:
- Crucible Direction injected as `[DIRECTION — AUTHORITATIVE]` system message: "supersedes any earlier brainstorm exchanges on all character details, world facts, and framing"
- Shape injected as `[NARRATIVE SHAPE — REQUIRED]` — appears immediately before `[CANON GENERATION]` so the model sees it last before generating
- `contextPinning.tail` set to 3 when direction or shape are present (pins them to context window tail)
- Canon prompt Structure section instruction explicitly says "you MUST use exactly that shape name — do not substitute another"

---

### 18. 🆕 Critic mode final message contaminates downstream pipeline

**Severity: Medium** | **First observed: Test 6**

Test 6 used Critic mode for the first time. The Critic's final message — "you need a spark to light the fuse you've laid" — introduced a catalyst-seeking framing that propagated through every subsequent pipeline stage:

- **Shape description:** "the physician's action locking it in place" — plot synopsis rather than structural logic
- **Direction closing paragraph:** "An event will force the Physician..." / "Will it be surrender, starvation, or one final, bloody act of defiance?" — story pitch with rhetorical question
- **Pass 1 CRITIQUE:** "The core conflict lacks a specific, immediate catalyst... the trigger is missing" — despite the CRITIQUE prompt explicitly prohibiting plot trajectory

Critic mode is useful mid-brainstorm: the grain store note and the smell-of-the-city note both came from Critic and materially improved the world. The problem is specifically a catalyst-seeking final message propagating through shape detection, Direction generation, and build pass CRITIQUEs.

**Action (walkthrough):** Critic mode works best mid-brainstorm, not as the final step before moving to Crucible. A Critic question asking for a plot catalyst should not be the last message before switching panels. No code fix needed.

---

### 19. Shape description degrades on retry with pre-filled name ✅ Fixed in Round 4

**Severity: Low** | **First observed: Test 6**

When the shape name field is pre-filled and only the description is generated, output quality is lower than blank-name generation. Two failure modes in Test 6:

- **Retry with cached context:** Model copied the preset definition verbatim rather than writing an original description.
- **Pre-filled name generation:** Model anchored to specific characters from the brainstorm and produced plot synopsis rather than structural logic.

**Fix:** Added a CRITICAL instruction to the end of `crucible_shape_prompt`: the description must be structural logic — not a plot summary, story pitch, or list of events. If a shape name is already provided, the model must describe the structural logic of THAT shape as applied to the material, without anchoring to specific characters or plot events.

---

### 20. 🆕 Unnamed protagonist creates lorebook collision risk

**Severity: Medium** | **First observed: Test 6**

The Physician has no personal name. The relmap correctly flags this: "name is: generic, collision risk: high" on three entries. Standalone `physician` keys will fire on any medical reference in story prose, activating the protagonist entry in unintended contexts.

This is a world-building gap the engine cannot fill — the Direction never named the character, and the build pass had no mechanism to flag or resolve it.

**Action (walkthrough):** The collision risk flag in the relmap output (`name is: generic, collision risk: high`) is the signal — users should add a personal name to any protagonist with this flag before writing. No code fix needed; this is a world-building gap the engine cannot fill.

---

## What Worked Well

**Brainstorm quality is high in both Cowriter and Critic modes.** Cowriter responses escalate creatively and treat the user's concept as something worth developing. Critic mode surfaces genuine gaps — the grain store note and the smell note in Test 6 both came from Critic and materially improved the Direction. The two modes serve different purposes and both are functioning as intended when used at the right moment.

**Direction extrapolation is strong.** All six Directions generated richly named worlds from sparse material. The engine consistently invents what the scenario implies is already in motion — Roric's two-sons backstory, the Physician's Tithe mechanism, the triangle of dependency in Test 6 were all invented from a brainstorm that named none of them.

**Shape detection is accurate for blank-name generation.** Custom shapes have been consistently precise and tailored to their material. Preset shape matching is reliable. Quality degrades specifically when the name is pre-filled (Issue 19).

**Build pass CRITIQUE loop is working.** Pass 1 CRITIQUEs correctly identify world gaps and Pass 2 delivers what was flagged. Test 6 Pass 1 correctly identified that the besieging force had no concrete presence inside the city — Pass 2 delivered The Chimes exactly as needed. The exception is when Critic mode contamination causes CRITIQUE to ask for plot catalysts instead of world gaps (Issue 18).

**Lorebook prose quality is high and consistent.** Character voice lines, conflict framings, and atmospheric descriptions are immediately usable. Test 6 standouts: Roric's backstory — "the experience scoured him clean of all ideology"; The Chimes as a four-actor entry where each character reads the sound differently; the Granary Silo as "a temple built to starvation, where faith has been replaced by the transactional hope of one more day's bread."

**Compound `&` keys and clean regex are now appearing.** The Round 3 keys prompt overhaul is producing the right key types: plain text predominates, regex appears only for legitimate plural/variant cases with `/i` flags, and compound keys like `physician & ledger`, `roric & audit`, `black apothecary & physician` are being generated correctly. Key quality improvement is real even as the deduplication problem persists.

---

## Summary Table

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | `crucible-build` needs continuation support | High | Bug | ✅ Improved / open |
| 4 | Faction Members field not filled | Low | Bug | 🚫 Not reproducible |
| 5 | Duplicate key/relmap sets per entry | Medium | Bug | ✅ Fixed R4 |
| 6 | Leading dash artifacts in keys | Medium | Bug | ✅ Fixed R4 |
| 8 | Relmap self-reference + duplicate runs | Low | Bug | ✅ Fixed R4 |
| 17 | Canon shape label wrong / contradicts Direction | Medium | Bug | ✅ Fixed R4 |
| 18 | Critic mode final message contaminates pipeline | Medium | Design | 📖 Walkthrough |
| 19 | Shape description degrades with pre-filled name | Low | Design | ✅ Fixed R4 |
| 20 | Unnamed protagonist — lorebook collision risk | Medium | Design | 📖 Walkthrough |