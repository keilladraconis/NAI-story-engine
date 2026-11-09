# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NAI Story Engine is a NovelAI script (.naiscript) that builds a **scenario** with the writer, then gets out of the way. The writer steers the story once it starts; Story Engine sets up the conditions it grows from: pressures, people, places and how they stand. It never plots.

The pipeline is seven stages: **Talk → Brief → Vignettes → Now → Canon → Cast → Distill**. Prose is drafted on the page by the editor's own model (Workshop Sends), kept in a free-prose **canon** outside the lorebook, checked by a GLM critic, and **distilled** into Memory, the Author's Note and lorebook entries at the end. The canon is the source of truth; the lorebook is its compiled form. Runs in NovelAI's web worker (QuickJS, no DOM).

## Commands

```
npm run build      # nibs build → dist/NAI-story-engine.naiscript
npm run format     # prettier -w .
npm run test       # vitest run
npx tsc --noEmit   # typecheck (the build does not)
```

`npm run build` refetches `external/*.d.ts` when they are more than a day old, with Node's `fetch`, which ignores the sandbox proxy. In the sandbox, fetch the three files with `curl` (which honours the proxy) into `external/` first; then the build skips the fetch.

**Prettier is pinned to an exact version — keep it that way.** Under a `^` range an older prettier already in `node_modules` satisfies the range and `npm install` leaves it in place, so a session once formatted with the wrong version and shipped the churn. `scripts/install_pkgs.sh` (the `SessionStart` hook) runs `npm ci` so every session starts from the lockfile, and `npm run format` runs a `preformat` guard (`npm ls prettier`) that refuses to format with a mismatched version. If format rewrites files you did not touch, the formatter is wrong, not the repo — do not commit the diff. `npm run format` calls `prettier`, not `npx prettier`: `npx` fetches from the registry when prettier is missing locally.

## Architecture

**Entry:** `src/index.ts` → `start()` in `src/ui/mount.ts`: loads the story's records, starts the GLM queue, registers the editor hooks, and mounts the surfaces in **one** `api.v1.ui.register` call (a second call replaces the first).

**Libraries:** `nai-store` (Redux-like store: `createSlice`, `subscribeSelector`) and `nai-gen-x` (the generation queue with budget waits) are npm packages; treat them as read-only.

**State (`src/core/store/`):** slices `canon` (brief, vignettes, starting point, documents, cast review), `workshop` (Workshop Sends switch, boundary, drafting target), `distill` (per-target records, opening kept), `chat` (facilitator transcript), `runtime` (GenX state, GLM jobs), `ui` (open stage, open document, selected lorebook entry). `persistence.ts` loads the first four from `storyStorage` (one record per slice, keys in `src/core/keys.ts`) and writes each back when its reference changes. They are **story-scoped on purpose**: undo and branching move the page, never the canon. No migrations; old keys are ignored.

**Two models, two budgets:**

- **The editor's model** (whatever the writer uses, Xialong for most) writes all long prose: vignettes, canon documents, the opening. It is driven by NovelAI's own Send, which costs no script budget. It gets **no instructions**: a frame shaped like a story's notes and a one-line direction.
- **GLM** (`src/core/engine/glm.ts`, `runGlm`) does the short structured work on the script budget: the facilitator, offers, the starting point's two ledgers (Xialong asked for them wrote a scene and ran past the Not yet), the critic, fixes and rewrites, distilling, keys. Every call goes through one GenX queue so the header shows one state for all of it. All GLM prompts are named exports in `src/core/prompts.ts`; nothing reads prompts from `project.yaml`.
- The UI never names a model or a budget source.

**The workshop (`src/core/workshop/`):**

- `context.ts` — `onContextBuilt` replaces a workshop Send's messages **keeping the editor's message shape**: Xialong's native context is a system message, a user message `Relevant persistent information:⏎<Memory>⏎***⏎Write.`, and the page as the assistant prefill (`***⏎` on an empty page). Only the Memory slot, `Write.` and the prefill change; roles are matched by name. The Opening keeps NovelAI's own context and only swaps the direction in.
- `frames.ts` — what a Send is shown in place of Memory, trimmed from the lowest priority to fit. **Limits never go in a frame**: telling a story model what must not happen puts it in context. The critic checks limits.
- `page.ts` — the draft region: everything after the **boundary** paragraph, marked by a divider widget and tinted paragraphs. Facts measured in NovelAI (`tools/surfaces-probe.naiscript`) that it depends on:
  - A native Send **continues the last paragraph**, so the draft always holds a paragraph of its own after the boundary.
  - Widgets and markers **do not survive a reload**; they are redrawn from the stored boundary at startup.
  - Deleting the boundary paragraph disposes the node widget (`dispose: sectionRemoved`); the boundary is recovered from the last draft seen.
  - A node widget "before the first section" does not render, so on an empty page the divider is an inline widget at the draft's start.
  - Widget content stays plain: a `row` wrapper or `display` made `createWidget` refuse its options.
  - Page work is serialised (`serial`); code already inside the chain calls `draw()` directly, never `redraw()`, or it waits on itself.
- `workshop.ts` — commands (switch, choose target, save, open on page) and the hooks. A Send aimed above the boundary is stopped. Changing the target or switching off is **refused while the draft holds text**, so a half-written draft never becomes something else or quietly becomes story.
- `targets.ts` — what each target is called, its save button's wording, and its default direction (a Send with an empty direction box uses it). Directions carry the Brief's voice, its first clause only: Xialong ignores "the brief's voice" but follows "told in third limited, past", and a whole voice field ("…: we are close to her thoughts") buried the scene after it.

**Canon work (`src/core/critic.ts`):** the critic reports `KIND | text` lines; Fix and rewrite-with-an-instruction rewrite one document. A result lands **only if the document still holds the text the call started from**; otherwise the writer's newer edit wins. A review counts only while its `textHash` matches the document (`reviewCurrent`).

**Distill (`src/core/distill.ts`):** targets are derived from the canon (Memory, Author's Note, World, Dramatis Personae, a profile per dossier, Locations, Relationship Map, Plot Situations), all in the `SE: Scenario` category. Each record keeps the hash of its sources and of the text written, giving four states: current, stale, hand-edited, not compiled. **A hand-edited target is never replaced without the writer confirming**, and a change of substance goes canon-first (rewrite the document, then distill). World and Dramatis Personae are Always On; profiles and locations get GLM keys; the relationship map and plots are keyed on cast names.

**Facilitator (`src/core/facilitator.ts`):** the Talk tab, modelled on Storifier's Desire Brief. Each turn the seed (the Brief) is rewritten from the latest exchange (`SEED_PROMPT`, `## SECTION` blocks; an empty or placeholder section never erases), then the facilitator asks a **round** of three to five multiple-choice questions (`ROUND_PROMPT`, parsed by `parseRound`) about the `INTERVIEW` areas not yet `ready`, in order: heat, voice, desires, premise, world, pace, limits, genre, title. The options are where it shows it understands the premise and its genre (the sentience model for a creature story, the limits that sit next to a kink), and an option not picked costs the writer nothing: a single invention in prose had to be argued down. Picks live on the round's message (`optionPicked`); Send answers the newest round with the picks (`answerText`, "Heat: Explicit graphic") and anything typed. A `READING:` line is the model thinking aloud and is dropped. **The code decides when it is over** (`interviewDone`), and the closing turn uses its own prompt (`FACILITATOR_CLOSE`); `withoutQuestions` enforces it. It never writes canon. Unanswered fields recorded as "Unspecified"/"None" are dropped from frames by `given()`.

**Offers (`src/core/offers.ts`, UI `components/Offers.tsx`):** on Vignettes and Now, GLM pitches what to draft next (`OFFER_PROMPT`, `START_OFFER_PROMPT`, read with `parseRound`) from the Brief, the kept vignettes and the offers passed over, plus the writer's note as a steer. Vignette pitches bracket the range against what is kept, which a blank Send cannot (its frame holds only the Brief); starting points come before every vignette's moment. Offers live in `runtime.offers[kind]` (not persisted). Vignette offers are asked for when the facilitator closes and after each saved vignette. A vignette pitch becomes the Send's direction (`vignetteDirection`), preset into the panel's box through `runtime.direction` (`seq` changes on every preset); a starting point is written by GLM (`writeStartingPoint`, `START_PROMPT`) and put on the page to edit and save. The lit button is the next step: Offer while nothing is picked or typed (Draft disabled), Draft once something is; saving unpicks.

**Draft buttons (`writeDraft` in `workshop.ts`):** press NovelAI's Send for the writer with `api.v1.editor.generate()` until the draft reaches `draftLength`, a Send adds almost nothing, or (for scenes only) the model starts a scene break or heading, which `onResponse` stops. A Send the writer makes themselves (`scriptInitiated: false`) ends the run.

**UI (`src/ui/`):**

- **Surfaces:** a sidebar panel (`sidebar/`: header, stage tabs, one component per stage), one script panel under the page (`panel/WorkshopPanel.tsx`, two rows at most: at phone width a script panel grows with its content and squeezes the page), the divider widget's content (`mount.ts`), and a lorebook panel (`lorebook/`). Context menus and toolbox options are not used: they are poor on mobile.
- **Mobile first, one layout:** inline styles have no media queries, so every layout is flex rows that wrap. Touch targets are `TOUCH` (44px), dense lists `DENSE` (36px). State is carried by text, never colour alone.
- **Renaming the script panel means re-sending the whole extension.** `api.v1.ui.update([{ id, name }])` removes the panel. The panel's name carries the workshop state ("Story Engine · Workshop on") so it reads even collapsed.
- Components read the store with `useSlice`/`useStream` (`bridge.ts`), built on `useSyncExternalStore`, so the first render is already correct. Select **primitives**; a selector returning a fresh object each call loops.
- `derive()` in `header/header-model.ts` is the **only** place that branches on `genx.status`; `tests/ui/countdown.test.ts` enforces it.
- The UI is Preact and re-renders from the store — **never** `updateParts`. The runtime sets the user-interaction flag (FlagB) from JSX events, so no parts-and-patch surface is needed for it.

## Coding Guidelines

- Read `external/script-types.d.ts` for NovelAI API signatures and trust it; no defensive existence checks around documented calls. Avoid `any`.
- Use `api.v1.hooks` (not `api.v1.events`) and `api.v1.uuid()`.
- Keep core free of UI imports. Where core needs something from the UI (the divider's content), the UI supplies it at startup (`setWidgetContent`).
- Be bold: no data migration, no legacy patterns. KISS. Follow the Boyscout Rule.
- Bump `project.yaml` `version` at most once per pull request. **Story Engine is in alpha**, so the major version is locked at `0` (`1.0` is reserved for Beta, `2.0` for production): **minor** for architecture, data model, persisted schema or pipeline changes; **patch** for everything else.
- Keep `CHANGELOG.md` in step with the in-progress version on every commit that changes user-visible behaviour, under Keep-a-Changelog headings. Refine the section as the PR goes, so it ends as a release note, not a commit log.

**UI Input Patterns:**

- **Design intents to be idempotent; do not add a tap debounce.** Carry the data an intent needs in its call, and refuse re-entry where the work spans an `await` (`saving` in `workshop.ts`, `once` in `critic.ts`, `running` in `distill.ts`).
- **Bind text entry with `onInput`, never `onChange`.** `change` fires only on blur, so an `onChange`-bound field holds stale state until focus leaves it. `tests/ui/text-input-events.test.ts` guards it. Fields that write to the store track typing locally and commit on blur (`Field` in `components/kit.tsx`): never dispatch per keystroke.
- **`disabled` is not a re-entry guard.** It is a render-time value; the guard belongs under the button.

**UI Rendering Rules:**

- **Never swap a component's type at a fixed position**, including to and from `null`. `{cond ? <A/> : <B/>}` leaves both in the DOM when the re-render comes from a detached callback (a timer, a store subscription, a GLM result). Mount every variant and toggle `display`, and render lists from arrays (`(ids ? ids.split(",") : []).map(…)`). `ConfirmButton.tsx` and `Header.tsx`'s `WidgetIcon` are the worked examples.
- **A controlled `<select>` does not snap back** when a change is refused and the store value stays the same; remount it with a key (`WorkshopPanel`).

## Key Constraints

- **No DOM:** QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`.
- API types: `external/script-types.d.ts` — the authoritative NovelAI API surface.
- The probes in `tools/` record what NovelAI actually does; when an API's behaviour matters, measure it with a probe before designing around it.
