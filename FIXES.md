# FIXES.md — Round 2 Bug Fix Resolution

Addresses five issues from FEEDBACK.md: three persisting bugs (#5, #6, #16) and two new findings (#15, #17).

---

## Issue 5: Duplicate key sets per entry — FIXED

**Problem:** Keys handler merged new keys with existing ones but preserved the stub key (the lowercased `displayName` inserted by the content handler as a placeholder). This meant every entry accumulated its stub alongside real keys, and repeated SEGA runs compounded the duplicates.

**Fix:** In the keys handler completion (`lorebook.ts`), after merging existing and new keys, the stub key is now explicitly dropped when real keys exist:

```typescript
const stubKey = (entry?.displayName || "").toLowerCase();
for (const k of [...existing, ...keys]) {
  const lower = k.toLowerCase();
  if (lower === stubKey && keys.length > 0) continue; // drop stub
  if (!seen.has(lower)) { seen.add(lower); merged.push(k); }
}
```

The stub served its purpose activating the entry in story text between content generation (Stage 5) and key generation (Stage 7). Once real keys arrive, the stub is redundant.

---

## Issue 6: Malformed regex + leading dash artifacts — FIXED

Two sub-issues in `parseLorebookKeys`:

### 6a: Leading dashes

**Problem:** GLM sometimes emits keys as markdown lists (`- archive of grievances`). The leading `- ` was preserved in the final key, preventing activation.

**Fix:** Added `.replace(/^-\s*/, "")` to the parse pipeline, stripping the dash before validation.

### 6b: Overbroad regex patterns

**Problem:** Patterns like `/clar(a|ra)?/` are structurally valid but semantically overbroad — they match any two-character string containing "cl". The existing `validateKey` only checked structural validity (parseable by `RegExp`), not semantic quality.

**Fix:** Added a minimum-match-length check. After constructing the regex, it's tested against a set of common two-character strings (`["ab", "el", "th", "an", "in", "re", "st"]`). If the pattern matches any of them, it's dropped as overbroad:

```typescript
const twoCharStrings = ["ab", "el", "th", "an", "in", "re", "st"];
if (twoCharStrings.some(s => pattern.test(s))) {
  api.v1.log(`[lorebook-keys] dropping overbroad regex: ${key}`);
  return null;
}
```

This preserves legitimate patterns like `/elara/` or `/sunflower.*incident/` while rejecting patterns that would fire on nearly any prose.

---

## Issue 15: Direction characters not auto-created as world state elements — FIXED

**Problem:** Build pass 1 generated LINK commands referencing characters named in the Direction (e.g., Agnes, Eleanor) that had no world state entries yet. The LINK executor silently dropped both endpoints, losing all relationship data from the pass.

**Fix:** Rather than parsing Direction prose for character names (fragile NLP), the fix is at the executor level in `crucible-command-parser.ts`. When LINK encounters a name that doesn't exist in the world state, it auto-creates a minimal stub CHARACTER entry before applying the link:

```typescript
for (const name of [cmd.fromName, cmd.toName]) {
  if (!findElementByName(getState(), name)) {
    const stub: CrucibleWorldElement = {
      id: api.v1.uuid(),
      fieldId: FieldID.DramatisPersonae,
      name,
      content: "",
    };
    dispatch(elementCreated({ element: stub }));
    log.push(`✓ AUTO-CREATE CHARACTER "${name}" (stub for LINK)`);
  }
}
```

This handles any element type the model LINKs to, not just characters from the Direction. Stubs are empty and will be overwritten by explicit CREATE or REVISE commands in the same or subsequent passes.

---

## Issue 16: REVISE command fails silently with type argument — FIXED

**Problem:** The model generated `[REVISE "FACTION" "The Neighborhood Watch"]`, mirroring CREATE's `TYPE "Name"` syntax. The REVISE regex only matched `[REVISE "Name"]`, so the command was silently dropped. The Neighborhood Watch retained its thin Pass 1 description.

**Fix:** Two changes in `crucible-command-parser.ts`:

1. Made the type argument optional in the REVISE regex:

```
/^\[REVISE\s+(?:[A-Z]+\s+)?"([^"]+)"\]/
```

The type is captured but ignored — REVISE looks up by name, not type.

2. Added a warning log for unrecognized command-like lines (any line starting with `[` that matches no known pattern):

```typescript
if (line.startsWith("[") && line.includes("]")) {
  api.v1.log(`[crucible-parser] unrecognized command: ${line}`);
}
```

This surfaces future parse failures instead of swallowing them.

**Tests added:** Two new test cases verify REVISE with type argument produces identical output to REVISE without it.

---

## Issue 17: Canon structure label inconsistent with Crucible shape — FIXED

**Problem:** Canon's Structure section drew from its own internal taxonomy of narrative architectures, ignoring the Crucible shape entirely. Test 4 had Crucible shape "Spiral Descent" but Canon labeled the story "Pressure Cooker."

**Fix:** Two changes:

1. In `createCanonFactory` (`context-builder.ts`), the Crucible shape is injected as a `[NARRATIVE SHAPE]` system message between the prefix and the canon generation prompt:

```typescript
if (state.crucible?.shape) {
  messages.push({
    role: "system",
    content: `[NARRATIVE SHAPE]\nThis story uses the narrative shape "${state.crucible.shape.name}": ${state.crucible.shape.instruction}`,
  });
}
```

2. In `project.yaml`, the Canon prompt's Structure section now reads: *"If a narrative shape is provided above, use that shape name and explain how it applies to this story. Otherwise, choose the narrative architecture that best fits."*

The shape description is included alongside the name so Canon's structural analysis reflects the actual shape logic, not a generic substitute.

---

## Verification

- `npm run build` — clean (no new errors)
- `npm run test` — 103/103 pass (2 new tests for REVISE with type argument)

## Files Modified

| File | Changes |
|------|---------|
| `src/core/store/effects/handlers/lorebook.ts` | #5: stub key removal; #6a: dash stripping; #6b: overbroad regex check |
| `src/core/utils/crucible-command-parser.ts` | #15: LINK auto-create stubs; #16: REVISE regex + parse warning |
| `src/core/utils/context-builder.ts` | #17: Crucible shape injection in Canon factory |
| `project.yaml` | #17: Canon prompt Structure section updated |
| `tests/core/utils/crucible-command-parser.test.ts` | 2 new tests for REVISE with type argument |
