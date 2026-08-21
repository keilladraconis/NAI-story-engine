# Engine Settings and HUD Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Engine's three settings out of NovelAI's script config and into the Setup tab, make every HUD slot a feather icon with a tooltip, and gate the Engine's log lines behind the existing debug toggle.

**Architecture:** `api.v1.config` is **read-only** — `get`, no `set` — so a Setup-tab control cannot write back to `project.yaml`. Engine settings move into `storyStorage` beside `kse-foundation` and `kse-chat`, which makes them **per-story**. That is the right granularity rather than a compromise: §1.2 positions the Engine for a writer steering an autonomous story, and the same person may hand-write the next one.

**Tech Stack:** TypeScript (strict), Preact/JSX, vitest, NovelAI script API.

## Global Constraints

- Continues branch `claude/story-engine-agentic-loop-ti2pgk`. Do **not** push; the parent session pushes.
- `project.yaml` version is `0.15.0` and was bumped for this PR. **Do not bump it again.**
- CLAUDE.md is binding. Load-bearing here: no `updateParts`; never swap a component _type_ at a fixed position (mount every variant, toggle `display`); `disabled` is not a re-entry guard; **`onInput` not `onChange`** for text entry; never dispatch in an `onChange`.
- The **triage-only boundary** from phase 4 still holds: nothing may write a lorebook entry, create a `WorldGroup`, or retire anything.
- Baseline: **840 tests / 74 files**, `tsc` clean, `npx prettier --check .` clean.
- `npm run build` rewrites `updatedAt`; check the version line before committing.
- Every commit ends with the `Co-Authored-By:` / `Claude-Session:` trailers.

## The net config change

`project.yaml` **loses three** entries and gains none:

| entry                | fate                                                 |
| -------------------- | ---------------------------------------------------- |
| `engine_enabled`     | → Setup tab, per-story                               |
| `engine_delay_ms`    | → Setup tab, per-story                               |
| `engine_min_prose`   | → Setup tab, per-story                               |
| `story_engine_debug` | **stays** — it now also gates the Engine's log lines |

Reusing `story_engine_debug` rather than adding an `engine_log` is deliberate:
the point of this work is fewer script-config options, and the Engine's five log
lines are debug detail by nature. The HUD is the always-on surface; the log is
the opt-in detail behind it.

## File Structure

| file                                              | responsibility                                              |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `src/core/engine/settings.ts` (create)            | `EngineSettings`, defaults, read/write against storyStorage |
| `src/core/store/effects/engine-loop.ts` (modify)  | read settings from the new home; gate its logs              |
| `src/core/keys.ts` (modify)                       | `STORAGE_KEYS.ENGINE_SETTINGS`                              |
| `src/core/store/slices/engine.ts` (modify)        | hold the whole settings object, not just `enabled`          |
| `src/ui/panels/setup/EngineSettings.tsx` (create) | the Setup-tab section                                       |
| `src/ui/panels/setup/Setup.tsx` (modify)          | mount it                                                    |
| `src/ui/hud/Hud.tsx` (modify)                     | every slot a feather icon with a tooltip                    |
| `project.yaml` (modify)                           | remove three entries                                        |

---

### Task 1: Settings, in Story Engine's own storage

**Files:**

- Create: `src/core/engine/settings.ts`
- Modify: `src/core/keys.ts`
- Test: `tests/core/engine/settings.test.ts`

**Interfaces:**

- Produces: `EngineSettings` (`{ enabled: boolean; delayMs: number; minProse: number }`),
  `ENGINE_DEFAULTS`, `readEngineSettings(): Promise<EngineSettings>`,
  `writeEngineSettings(next: EngineSettings): Promise<void>`.
- `readEngineSettings` **moves here** from `engine-loop.ts`, which keeps its name
  and signature so the effect's callsites do not change.

Storage is `storyStorage` under `STORAGE_KEYS.ENGINE_SETTINGS` (`"kse-engine"`).
One record, not three keys: these are read together on every pass and written
together from one form, and storyStorage has none of historyStorage's
copy-on-write-per-key reason to shard.

**Validate on read, do not trust the slot.** It is JSON a previous version wrote.
A missing record, a malformed one, a `delayMs` of `-1` or `NaN` must all yield a
usable settings object rather than a pass that never fires or one that fires
instantly forever. Clamp: `delayMs` to a sane floor and ceiling, `minProse` to at
least 1.

Tests: absent record → defaults; partial record → defaults for the missing
fields; hostile values (negative, `NaN`, wrong type, a string where a number
belongs) → clamped or defaulted, never propagated; round-trip through
`writeEngineSettings` → `readEngineSettings`.

- [ ] Write the tests first, confirm they fail, implement, verify, commit.

---

### Task 2: Read the settings from their new home

**Files:**

- Modify: `src/core/store/effects/engine-loop.ts`
- Modify: `src/core/store/slices/engine.ts`
- Modify: `project.yaml` (remove the three entries)
- Test: `tests/core/engine/pass.test.ts`, `tests/core/engine/trigger.test.ts` (existing)

The effect stops reading `api.v1.config` for its three settings and calls the new
`readEngineSettings`. Delete `engine_enabled`, `engine_delay_ms` and
`engine_min_prose` from `project.yaml`. **Leave `story_engine_debug`.**

The slice currently mirrors `enabled` alone. It now holds the whole settings
object, so the Setup form can render from the store and repaint when a pass
re-reads. Keep `EngineSliceState = LoopState & { settings: EngineSettings }` —
settings are not part of the machine and must not enter `loopReducer`.

**The existing tests configure these through `api.v1.config.get`.** They will
need to seed `storyStorage` instead. That is a moved goalpost, not a weakening —
but read each one before changing it, and if a failure looks like a real
regression, stop and report rather than editing the test to match.

**Do not lose the phase-4 guarantees while moving this.** All of these have
tests; they must still pass, and if one starts passing vacuously because the
config mock no longer drives anything, that is a finding to report:

- the ⚡ and the wakeup both refuse when the Engine is off, checked once in `runPass`;
- the setting is read at startup so the HUD does not claim "Off" to a writer who opted in;
- `engine_min_prose` gates before `passRequested`, never by faking `assessed { backlog: 0 }`.

- [ ] Tests first where behaviour changes; verify; commit.

---

### Task 3: The Setup tab section

**Files:**

- Create: `src/ui/panels/setup/EngineSettings.tsx`
- Modify: `src/ui/panels/setup/Setup.tsx`
- Test: `tests/ui/engine-settings-source.test.ts` (static scans — `.tsx` is never collected)

A collapsible section at the **bottom** of the Setup tab, below the opening-scene
card, following the Foundation section's collapse pattern. Read
`src/ui/panels/setup/Setup.tsx` and the Foundation section first and match them
rather than inventing a second style.

Contents, in this order:

1. **Engine** — a toggle. Copy should say what turning it on actually does today:
   it watches what you write and records what needs attention; it does not change
   your lorebook. Do not promise phase 6.
2. **Delay** and **Minimum new paragraphs** — number inputs, secondary to the
   toggle. These are for a writer who wants to tune; the toggle is the one that
   matters.

**Rules with history, all in CLAUDE.md:**

- **`onInput`, never `onChange`**, for the number fields. `change` fires on blur,
  so anything reading state before blur sees the pre-edit value.
- **Never dispatch in an input handler** — reducer overhead at keystroke
  frequency. Draft locally, commit on an explicit action or on blur.
- Writing to storyStorage is a commit point, not a keystroke event.
- Mount both toggle states and toggle `display`; do not swap component types.

Static guards: no `updateParts`; no `onChange=` on a text or number input; the
section is actually mounted in `Setup.tsx`.

- [ ] Implement, verify, commit.

---

### Task 4: HUD legibility, and quiet logs

**Files:**

- Modify: `src/ui/hud/Hud.tsx`
- Modify: `src/core/store/effects/engine-loop.ts`
- Test: `tests/ui/hud-source.test.ts` (existing)

**Every slot becomes a feather icon with a tooltip.** The line currently mixes
feather icons for state with bare unicode for the counts — `12¶ ⚑5 ∆0` — and the
unicode half is what is unreadable. `nai:icons/feather` exposes the full set.

| slot    | now          | becomes                                                        |
| ------- | ------------ | -------------------------------------------------------------- |
| state   | feather icon | unchanged                                                      |
| backlog | `¶`          | a feather icon + count                                         |
| threads | `⚑`          | a feather icon + count                                         |
| touched | `∆`          | a feather icon + count                                         |
| budget  | `▮▮▮▯`       | **keep the four bars** — a gauge shows a level; an icon cannot |
| ⚡      | `Zap`        | unchanged                                                      |

Two rules on the icons: **no icon may appear twice on the line** (the state slot
already owns `Edit3`, so touched needs a different one), and every slot needs a
`title` saying what the number means in words — that is where the vocabulary is
learned, since a modeline teaches nothing on its own.

Keep §9.1's density: this stays a shape to read at a glance, not a sentence.

**Then gate the Engine's logs behind `story_engine_debug`.** Five `api.v1.log`
callsites in `engine-loop.ts`. With the flag off the Engine is silent and the HUD
is the whole surface; with it on, the log is the detailed account. Read the flag
once where the pass is built, not per line.

Update the existing HUD source guards for the new icons — the "one icon per
`HudState`" scan reads the union from the model and must keep working.

- [ ] Implement, verify, commit.

---

### Task 5: Changelog and spec

**Files:** `CHANGELOG.md`, `docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md`

The 0.15.0 Engine bullets currently tell the writer to turn the Engine on in
"Story Engine's script settings" and describe the HUD's glyphs. Both are now
wrong. Rewrite them, and say the setting is **per story**.

In the spec: §3.1 and §9.2 both say these settings belong in the Setup tab — that
is now true rather than aspirational, so state it as done. Record in §14.1 that
`api.v1.config` is read-only, which is _why_ they became per-story rather than
global, and that the HUD's slots are icons because the unicode glyphs proved
unreadable in use.

Do **not** bump `project.yaml`.

---

## Verification

```bash
npm ci && npm test && npx tsc --noEmit && npm run build && npx prettier --check .
```

Then in a **scratch story**:

1. The three Engine entries are gone from NovelAI's script settings; only
   **Story Engine Debug** remains of the power-user toggles.
2. Setup's Engine section is collapsed by default, expands, and the toggle
   persists across a reload.
3. Turning it on and generating runs a pass; the HUD moves and the backlog
   returns to 0.
4. Every HUD slot has a tooltip naming what it counts.
5. With **Story Engine Debug** off, the log is silent. With it on, the
   `[engine] intent (not executed): …` lines appear.
6. Open a **second** story: the Engine is off there, because the setting is per
   story.

## Out of scope

- **Executing intents** (phase 6). Drain still logs and clears.
- **`Thread` replacing `WorldGroup`** (phase 5).
- **A second logging surface.** The script log is the observability surface;
  `story_engine_debug` toggles it.
