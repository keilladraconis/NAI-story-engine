# FIXES.md — Round 3 Bug Fixes + Keys Overhaul

Addresses remaining issues from FEEDBACK.md (#5, #6, #8) plus a full overhaul of lorebook key generation to align with NAI lorebook syntax.

---

## Issue 5: Keys generation runs twice per entry — FIXED

**Problem:** After the keys handler wrote merged keys via `api.v1.lorebook.updateEntry()`, the next SEGA scheduling cycle re-read the entry. Any API consistency lag made the entry appear to still have stubs, queuing it again.

**Fix:** Added `keysCompleted: Record<string, boolean>` to `SegaState`. The keys handler marks the entry completed after writing. `findEntryNeedingKeys` checks this set first and skips entries already processed in the current SEGA run. Cleared on `segaReset`.

**Files:** `types.ts`, `slices/runtime.ts`, `handlers/lorebook.ts`, `effects/sega.ts`

---

## Issue 6: Overbroad regex patterns — FIXED (expanded + overhauled)

**Problem (Round 2):** The overbroad check only tested 2-char strings, missing patterns like `/any(a|ya)?/` (matches "any") and `/len(a|na)?/` (matches "len").

**Problem (Round 3):** The entire regex approach was wrong. Fragmentary name regexes like `/mir(a|ra)?/` are unnecessary — plain `mira` is simpler and sufficient. Validation didn't understand NAI's `/pattern/flags` format. No awareness of `&` compound keys.

**Fix — validateKey overhaul:**
- Parses `/pattern/flags` format (supports `i`, `s`, `m`, `u` flags per NAI spec)
- Rejects malformed regex (no closing `/`) instead of auto-fixing
- Handles `&` compound keys — splits on ` & `, validates each part recursively
- Preserves original casing on regex keys (they control case sensitivity via `/i`)
- Extended overbroad check to include 3-char test strings: `"any", "the", "len", "ion", "ing", "ers", "for", "are"`

**Fix — parseLorebookKeys:**
- Only lowercases plain-text keys; regex keys pass through as-is

**Files:** `handlers/lorebook.ts`

---

## Issue 8: Relmap "primary characters" semantics unclear — FIXED

**Problem:** The field name "primary characters" was ambiguous. The model oscillated between listing characters *mentioned in the entry* (correct) and listing the entry's *own subject* (wrong).

**Fix:** Renamed to "related characters" in the relmap prompt examples (`project.yaml`), the `parseNeedsReconciliation` regex (`lorebook-strategy.ts`), and code comments.

**Files:** `project.yaml`, `lorebook-strategy.ts`, `sega.ts`

---

## Keys Prompt Overhaul

**Problem:** The keys prompt taught bad patterns — fragmentary regexes, missing `/i` flags, no `&` compound keys. The validation logic and prompt were misaligned on what constitutes a valid key.

**Fix — Prompt rewrite (`lorebook_keys_prompt` in `project.yaml`):**
- Added KEY TYPES reference section: plain text (preferred), `/regex/i`, compound `&`
- Explicitly banned fragmentary name regex: "`elara` is always better than `/el(a|ara)?/i`"
- Example rewrites:
  - Mira Voss: `mira, voss, caldera station, ashfield` (was: `/mir(a|ra)?/`, ...)
  - Sunken Arcade: `sunken arcade, lower city, ashfield` (was: `... /lower.?city/`, ...)
  - Mira's operating room: `mira & operating, voss` — demonstrates `&` compound
  - New 4th example (Vortex Collective): `/vor(tex|tices)/i` — legitimate regex for plural/variant matching

**Files:** `project.yaml`

---

## Verification

- `npm run build` — clean
- `npm run test` — 120/120 pass

## Files Modified

| File | Changes |
|------|---------|
| `src/core/store/types.ts` | #5: `keysCompleted` added to `SegaState` |
| `src/core/store/slices/runtime.ts` | #5: initializer, `segaKeysCompleted` action |
| `src/core/store/effects/handlers/lorebook.ts` | #5: dispatch keysCompleted; #6: validateKey overhaul (flags, compounds, overbroad); parseLorebookKeys casing fix |
| `src/core/store/effects/sega.ts` | #5: keysCompleted check in findEntryNeedingKeys; #8: comment rename |
| `src/core/utils/lorebook-strategy.ts` | #8: parseNeedsReconciliation regex + comment rename |
| `project.yaml` | #8: relmap rename; Keys prompt overhaul |
| `tests/.../lorebook.test.ts` | 17 new tests: regex flags, compounds, casing, overbroad 3-char |
