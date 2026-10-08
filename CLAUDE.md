# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NAI Story Engine is a NovelAI script (.naiscript) that builds a Scenario — pressures, the entities under them and how things stand between them — from a few sentences, and keeps it true as the story is written. It authors conditions, never plots, arcs or goals: a model shown a destination writes the arrival. World Entries are Characters, Systems, Locations, Factions, Situational Dynamics and Topics. Runs in NovelAI's web worker environment (QuickJS, no DOM).

## Commands

```
npm run build      # nibs build → dist/NAI-story-engine.naiscript
npm run format     # prettier -w .
npm run test       # vitest run
```

**Prettier is pinned to an exact version — keep it that way.** Under a `^` range an older prettier already sitting in `node_modules` satisfies the range, so `npm install` leaves it in place and ignores the lockfile. That happened: a session formatting with 3.7.4 wrapped union types the pinned version keeps inline, which shipped as a spurious "formatting cleanup" (15fb872) and had to be reverted (ac49266). The exact pin does not help a `node_modules` installed for a _different branch_ — check out this branch over a tree installed from `main` and you still get 3.7.4, which is how a fourth session churned the same three files. Two things now prevent it. `scripts/install_pkgs.sh` — the `SessionStart` hook that installs dependencies — runs `npm ci`, not `npm install`, so every session starts from a `node_modules` rebuilt from the lockfile instead of whatever the previous branch left behind. That removes the cause. And `npm run format` runs a `preformat` guard (`npm ls prettier`) that refuses to format when the installed version does not match the pin, which catches the case anyway if you installed by hand. If format ever does rewrite files you did not touch, the formatter is wrong, not the repo — do not commit the diff.

`npm run format` deliberately calls `prettier`, not `npx prettier`. npm already puts `node_modules/.bin` first on `PATH`, so both run the same local binary; the difference is that `npx` _fetches_ prettier from the registry when it is missing locally, which is one more way to format with a version the lockfile never pinned.

## Superpowers skills

`.claude/skills/` holds a vendored copy of [obra/superpowers](https://github.com/obra/superpowers) (MIT, v6.2.0) — TDD, systematic debugging, brainstorming, plan writing, and related workflows. They are **vendored rather than installed as a plugin** because the remote sandbox sets `SKIP_PLUGIN_MARKETPLACE=true`, so a plugin would only ever resolve on a local checkout. Committed skills are discovered directly and work everywhere the repo is cloned.

Do not hand-edit anything under `.claude/skills/` — it is generated. Run `scripts/vendor_superpowers.sh` to regenerate; bump `SUPERPOWERS_REF` in that script to update. The pinned ref is the same commit the official `claude-plugins-official` marketplace ships for v6.2.0, so the tree matches what the plugin install would deliver. The one deliberate change is that upstream's `superpowers:<skill>` cross-references are rewritten to bare `<skill>`, since project skills are invoked without the plugin namespace.

Do not also enable the superpowers plugin in `.claude/settings.json` — the plugin and the vendored copy would load all 14 skills twice.

## Architecture

**Entry point:** `src/index.ts` — initializes GenX, registers store effects, loads persisted data, mounts UI extensions.

**Custom frameworks (treat as read-only):**

- `nai-store.ts` (in `lib/`) — Redux-like store with `createSlice`, `dispatch`, `useSelector`, `subscribeEffect`
- `gen-x.ts` (in `lib/`) — Generation queue engine with budget management and pub/sub state updates
- `nai-simple-ui` (in `vendor/`) — SUI component framework. `SuiComponent` subclasses own state, themes, and `compose()` logic. `StoreWatcher` bridges the nai-store to SUI.

**State (`src/core/store/`):**

- `slices/story.ts` — Field contents and World Entry items (DULFS)
- `slices/world.ts` — `WorldEntity` records, `Thread`s
- `slices/chat.ts` — Chat messages (Scenario and refine sessions; the `summary` type remains but nothing in the UI opens one)
- `slices/foundation.ts` — Situation, intensity, contract, ATTG, style fields
- `slices/ui.ts` — Edit modes, lorebook selection state
- `slices/runtime.ts` — Generation queue status, GenX state
- **Persistence is split by what the data belongs to.** Branch-scoped state —
  `world` and story fields — lives in `api.v1.historyStorage`, sharded one
  record per entity/group/field behind an `index` record, so undo and redo move
  the World with the story (`src/core/store/persistence/`). Story-scoped state
  stays in `api.v1.storyStorage`: `chat` under `STORAGE_KEYS.CHAT`, because
  chats follow the writer rather than the branch, and `foundation` under
  `STORAGE_KEYS.FOUNDATION`, because it is the story's premise rather than a
  property of a point in it — and because its ATTG/Style mirror into Memory and
  Author's Note, which undo does not move either. Branch-scoping the Foundation
  meant undo reverted what the writer saw while Memory kept the newer text the
  model actually read. Deleting a branch record means rewriting the index, never
  `historyStorage.remove()` — a removal uncovers the ancestor node's copy and
  resurrects it.

**Config:** `src/config/field-definitions.ts` — `FIELD_CONFIGS` array defines all field metadata, layouts, and generation prompts. Uses `FieldID` enum and `DulfsFieldID` union type throughout.

**UI (`src/ui/`):**

- Components are Preact function components under `src/ui/panels/` and `src/ui/components/`, composed into `App.tsx` and mounted by `mount.ts`. They read the store via `useSlice`/`useStream` (`src/ui/bridge.ts`), thin wrappers over `useSyncExternalStore` — snapshots are correct on first render, so there's no separate "seed the initial value" step to remember.
- The UI is Preact/JSX and re-renders from the store — **never** `updateParts`, with no exceptions. Nothing in `src/` calls it. The header used to be the one carve-out: a UIPart tree with its own diffing driver, because a click inside a `part.jsx()` did not clear the harness's user-interaction flag ("FlagB") and budget-stalled generation could only be resumed from a real `part.button()`. The runtime now sets that flag from JSX events (`click`, `dblclick`, `mousedown`/`mouseup`, `contextmenu`, `keydown`/`keyup`/`keypress`, `pointerdown`/`pointerup`, `touchstart`/`touchend`, `input`, `change`, `submit`), so `src/ui/header/Header.tsx` is an ordinary component rendered by `App` above the tab bar. Do not reintroduce a parts-and-patch surface to work around FlagB.
- `derive()` in `src/ui/header/header-model.ts` owns the generation state machine — it is the **only** place that branches on `genx.status`, and `tests/ui/countdown.test.ts` enforces that mechanically. `Header.tsx` renders the `WidgetMode` it returns and never reads the raw status; neither does any other component. Two surfaces reading the status directly is how they drift about whether a generation is waiting, queued, or done.
- Shared storyStorage keys and other core↔UI slot constants live in `src/core/keys.ts` (see its header comment — relocated out of the retired SUI `ui/framework/ids.ts`, which no longer exists). The handful of remaining literal UIPart ids (`kse-root`/`kse-jsx-root`/`kse-sidebar` in `mount.ts`, `OPENING_MODAL_IDS` in `header/opening-scene-modal.ts`) are local constants scoped to their own file, not a centralized registry — ordinary JSX elements need no ids of their own.
- `src/core/utils/context-builder.ts` — Builds layered AI prompts from current state

**Entity system (`src/ui/components/SeEntityCard.ts`, `SeEntityEditPane.ts`):**

- `WorldEntity` has `id`, `categoryId` (`DulfsFieldID`), `lifecycle` (`"draft" | "live"`), optional `lorebookEntryId`, `name`, and `summary`.
- **Entity summary** is a Story Engine–internal field. It is stored only in Redux, editable only in `SeEntityEditPane`, and **never synchronized with or derived from lorebook entry text**. The lorebook entry text is a separate field populated by generation.
- **Draft entities** have no lorebook entry, and come only from the "+ Add Entity" button, which creates a draft — **no lorebook entry is created until the user hits Save**, so cancelling out leaves no orphaned lorebook entries behind. The edit pane still exposes every field (name, summary, category, lorebook content, keys, Always On) so users can author the full entry by hand before promoting it; only the Generate icon buttons for content/keys are hidden, since those stream into a live lorebook entry that doesn't exist yet.
- **Live entities** have a lorebook entry (`lorebookEntryId`). Their edit pane additionally shows the Generate icon buttons next to Content and Keys. Lorebook content/keys are **only flushed to the lorebook API on Save** — not on every keystroke.
- **Draft → live promotion:** Saving a draft entity creates a lorebook entry in the entity's current category (via `ensureCategory(entity.categoryId)`) and persists the draft name, lorebook content, keys, and Always On state that were entered in the pane. The entry id is attached via `entityLorebookEntryBound`.
- **One entity per lorebook entry**: `entityBound` / `entitiesBoundBatch` drop any entity whose `lorebookEntryId` is already bound. Two entities over one entry would generate into it twice and list it twice in the World, and the Import wizard's Bind mints a fresh entity id per click — so the invariant is enforced in the reducer, not at the callsites.
- **A Scenario Build `CREATE` binds its entry at once** through `bindEntryFor` (`effects/entity-entry.ts`): an unmanaged lorebook entry (no category) with the same display name, compared case-insensitively, is adopted and moved into the `SE: <Category>` category; otherwise an empty entry is created there, keyed on the name. The summary is not seeded into the lorebook.
- **Category**: `entity.categoryId` is a Story Engine concept — it drives sidebar organization, template selection, and the prefill `Type:` line. It is **independent of the lorebook entry's own category**: the lorebook category is where the entry lives in the user's lorebook, only assigned at creation time (`SeEntityEditPane` on save; `bindEntryFor` at bind time). Users commonly reorganize imported or long-running entries in their lorebook for their own preferences; Story Engine does **not** chase those moves, and `entityCategoryChanged` only updates Redux — it does not rewrite `entry.category`. `SeEntityEditPane` shows a category picker (SuiActionBar) for all entities.

**Threads (`src/core/engine/thread-*.ts`, `review-strategy.ts`):**

- A `Thread` is the standing state of an arc or relationship between known entities: `title`, `state`, `latent`, `wish`, `entityIds`, optional `lorebookEntryId`, `status` (`"open" | "concluded"`).
- **`state` is what the story model sees; `latent` never reaches the story prefix, the Thread's own lorebook entry or lorebook-generation context while the Thread is open.** `state` is the Thread's lorebook entry text. `latent` holds what is unspoken, owed or concealed — a model shown that something has not happened writes it happening. The single exception is `conclude()`, which folds it into the `established` ledger of the cast's entity rewrites after the thing it held back has happened. `tests/core/engine/latent-privacy.test.ts` lists the only files that may name `latent`; a failure there is a leak, not a list to extend. That scan follows the identifier, so it cannot see the value travelling as text: the Scenario chat's `[THREAD … | state | latent | wish]` command stays in its own transcript, and that transcript enters no other generation's prefix. `private-notes-sinks.test.ts` checks the sinks by sentinel.
- **`wish` is what the writer wants to come about, and the story model is never shown it.** No generation reads it from the store; the Scenario chat sees only the wishes it wrote itself, in its own transcript, which is why the edit pane's caption says "Never shown to the story model." and not "any model". It is not a fact, so unlike `latent` it is never folded into `established` on conclusion. It is written by the Scenario chat's `THREAD` command and the Thread edit pane only (`threadWishSet`); `latent-privacy.test.ts` holds its allow-list (`WISH_ALLOWED`) and `private-notes-sinks.test.ts` its sentinel.
- **A Thread's entry activates when its cast is on stage** (`thread-condition.ts`): `keys: []`, `forceActivation: false`, one advanced condition over the cast's aliases — each member's own lorebook keys plus its display name. Both members of a pair, any two of a larger cast. No cast, no entry.
- **`syncThreadEntry` is the only thing that writes a Thread's entry**, and `state` is the authority for its text (unlike an entity's entry, where the lorebook outranks the store).
- **Only the review pass admits a Thread.** The per-generation triage can only `REVISE` an entity. The review runs every `reviewEvery` paragraphs and emits `UPDATE` / `ADMIT` / `CONCLUDE`. `parseReview` drops an admission that names anyone who is not a known entity. `applyFloors` does the rest: it turns an admission whose cast is an open Thread's live cast into an `UPDATE` of that Thread, and refuses one that is the second in its review, whose cast is not each named in three separate paragraphs, or that would exceed the thread limit. The limit binds the Engine only. A story with no usable review watermark is reviewed from its latest scene, not from its first page (`reviewWindow`). A Thread may have a single member when the Scenario chat or the writer makes it; the review still admits only two or more.
- **Concluding** disables the entry and queues an entity `revise` per cast member carrying the Thread's title, state and private notes as `established`.
- The review and Thread write prompts are measured with `tools/review-probe.naiscript` (twenty runs per fixture, in NovelAI), not by unit tests.

**Scenario chat (`src/core/chat-types/scenario.ts`, `handlers/forge-chat.ts`):**

- **One chat type, `scenario`, in two modes** held in the chat's `subMode` (`scenarioMode` in `chat-types/scenario.ts`; anything but `"build"` is plan). The mode in force when the writer sends decides the turn, and each assistant message is stamped with the mode that wrote it (`ChatMessage.mode`). Internal names keep "forge" for the command mechanism (`forgeChatContinueRequested`, `forge-chat-effects.ts`); the product word is Scenario.
- **Plan talks and applies nothing.** It runs on the Creative model with its own message factory (`buildScenarioPlanStrategy`) but targets the ordinary `chat` request, so `chatHandler` commits the text and never reads it for commands — a bracketed command in a Plan reply is text. An empty send does nothing in Plan. The Plan effect is synchronous: the strategy is built without an `await` (the factory reads the Creative model when it runs; the engine takes a trimmed prefill from the messages, never from the strategy), so the placeholder is added and the request queued in the turn the send arrived in, and the queue check (`scenarioRequestPending`) is the whole re-entry guard for Plan and Build alike. A `chat` completion that brought nothing removes its placeholder if that is still empty (`chatHandler`), as the Build handler does; a message that already has content stays.
- **Build thinks out loud, then writes commands**, always on GLM (`buildScenarioBuildStrategy`, the `forgeChat` request), asking 1024 output tokens per call and continuing up to four calls. `enable_thinking` is not used: thinking output is reported lost and truncated in NovelAI. Instead thinking is positional — in a Build reply, everything that is not a recognised command line is thinking. The reply is started on `SCENARIO_BUILD_PREFILL` ("Settled:") and keeps it (`prefillBehavior: "keep"`): asked only by the prompt, GLM went straight to commands and there was no thinking to show. An empty Build send stands for `SCENARIO_BUILD_INSTRUCTION`; a typed one directs the build. The send says which: `forgeChatContinueRequested` carries `directed` (`handleSend` sets it from whether anything was typed), because the transcript's tail cannot — after a failed Plan turn it is the writer's own Plan message. Only a retry, which carries no flag, is read from the tail.
- **Later turns see a Build reply as its commands only** (`scenarioConversation`): the thinking is dropped, and a Build reply that wrote no command is left out. `formatRejections` reads the last Build reply or reply with segments, not the last reply, so a rejection outlives a Plan reply but not a later Build reply that settled nothing (edited or unfinished).
- **Retry re-runs a reply in the mode that wrote it**, whatever the toggle says; a reply from before the modes re-runs as Build.
- **A Build reply renders as pills** (`chat-types/pills.ts`, `ui/panels/chat/BuildPills.tsx`): `[thinking]`, `[create | "Name"]`, and so on, collapsed, each opening in place (the pill widens to the row). A pill that has a target opens into the World's own `EntityCard` or `ThreadItem`, mounted the first time it is opened and hidden after; the others show what their command said (`ForgeActionRecord.body`, built by `commandBody`). Command labels read like `[+ character | Name]`. `buildPills(content, segments, generating)` uses the settled `forgeSegments` when present, otherwise a provisional parse of the text, and reads as "thinking…" only while that message is being generated. A reply with no settled segments that is not being generated (cancelled, failed or edited) executed nothing, so its command pills read as not applied. Editing a reply (`messageUpdated`) drops its `forgeSegments`, so an edited reply's pills re-read its text; the completion handlers set segments after updating content. `PillPart.unseen` marks the parts the story model is never shown (a THREAD's private and wish); `commandBody` sets it, and `BuildPills.tsx` captions on the flag because that file may not name `wish`. Open or closed is view state, held with a key and compared during render; the key is the message id, whether the pills come from settled or provisional segments, and the pill count, so the open set resets when the list's shape changes (`pillsKey` in `Message.tsx`). Every pill body is mounted once and its `display` toggled.
- **A `THREAD` has exactly five segments**, `[THREAD "<Title>" | "<A>", "<B>" | state | private | wish]` (the prompt calls the fourth `private`; in code it is `latent`). Position is meaning, so a shorter command is never guessed at: it is not parsed, its pill carries `THREAD_REPAIR` and what was written (`unrecognizedAction`), and the next Build turn's context lists what was rejected. A `THREAD` whose title matches an open Thread rewrites its state, private notes and wish — never its cast — and an empty segment never erases a stored value. A new `THREAD` naming anyone who is not a known entity is rejected whole. Every rejection reason is written as the repair (`REASON` in `handlers/forge-chat.ts`), because the next Build turn's `[REJECTED LAST TURN]` block shows it to the model. There is no `CRITIQUE` command.
- **There is no draft stage.** What Build writes is live at once, and deleting a chat leaves what it built in the World. Chats of removed types are dropped on load (`keepKnownChats`).
- **What Build may touch.** `REVISE` and `RENAME` work on any entity (a revise writes the summary only; a rename also renames the bound entry, and swaps its key while that is still the name stub). `DELETE` works only on an entity with a `sourceChatId`, and removes its lorebook entry. A `REVISE` of a name that does not exist creates it, live, as a Character. The model sees one `[WORLD]` block with those entities starred.
- **Undo is per Build reply.** Each applied command stores its reverse on its `ForgeActionRecord` (`undo`, a `ForgeUndo`); a Thread's three texts are positional there so the type names no private field, and only `handlers/forge-chat.ts` reads them. `undoTurn` plays a reply's records back last first and marks it `undone`. A revise or rename is reversed only if the value still equals what the command wrote, and so is a Thread rewrite, which is also not reversed on a Thread that has since concluded. Undo of a `CREATE` deletes the entity and removes its entry only if the command created it (an adopted entry stays), reading the entry first so one already deleted by hand is not an error; undo of a `DELETE` recreates the entry and rebinds the entity to the id the lorebook returns; undo of a created Thread deletes the Thread, and its entry is switched off, never removed, as when a Thread is deleted in the World. Only the latest standing Build reply is undoable. `hasStandingCommands` (`chat-types/undo.ts`) is the one test for a reply whose commands stand, used by Undo and by the hiding of Edit: an edit drops the segments that hold the undo. Retry undoes first, and is refused when pruning would drop a later Build reply still applied (`pruneBlocked`). An undone reply is left out of later turns.
- **Nothing else runs for a chat while a turn is being undone.** Build, Plan, Undo and Retry for a chat sit behind one guard in the `registerForgeChatEffects` closure, a set of chat ids being reversed plus `scenarioRequestPending`, so nothing for that chat runs while an undo awaits the lorebook. A Scenario Retry is routed through `scenarioRetryRequested` to `forge-chat-effects.ts`.
- The chat view pages 25 messages at a time (`ui/panels/chat/paging.ts`); that is view state, never stored.
- The Build prompt is measured with `tools/scenario-probe.naiscript` (twenty runs per fixture, in NovelAI; each fixture is a short Plan conversation and an empty Build send started on the same `Settled:` prefill, and it also counts entities nobody asked for); `tests/tools/scenario-probe.test.ts` keeps its copy of the prompt in step. Plan's voice is not measured.

**Prompts:** All generation prompts are hard-coded constants in `src/core/utils/prompts.ts`. They are **not** configurable via `project.yaml`. `project.yaml` contains only non-prompt settings (model, feature flags).

**Prompt policy — prompts live in `src/core/utils/prompts.ts`, not in code files and not in `project.yaml`.**

- Every generation prompt is an exported string constant in `prompts.ts`. Import and use directly — no `api.v1.config.get()` for prompt fields.
- `project.yaml` is for runtime settings only: `model`, `sega_skip_*`, `generation_journal`, `erato_compatibility`, `story_engine_debug`. Do not add prompt fields there.
- When adding a new prompt, add it to `prompts.ts` as a named export.

**Generation pipeline:**

- Context is layered (`buildStoryEnginePrefix`): Foundation (ATTG, Style, Situation, Contract) and Setting → World Entries → story text, with each task's own instructions after. The chat transcript is not part of the prefix.
- The prefix's World block lists each entity as `Name: summary` under its category (`getExistingEntityItems`): a summary alone does not say whose it is. An entity with no summary is left out.
- World Entries use two-phase generation: Phase 1 generates a list of names, Phase 2 generates detailed content per item
- S.E.G.A. (Story Engine Generate All) fills blank fields using round-robin queueing across categories
- Lorebook sync (`src/core/store/effects/lorebook-sync.ts`) manages SE-category creation and DULFS item→lorebook binding. It does **not** sync entity summaries in either direction — summaries are SE-internal only.
- **Information hierarchy for lorebook generation: DRAFT > LOREBOOK > STATE** for the fields that actually have all three layers (notably `displayName`): prefer in-pane draft values (storyStorage slots like `EDIT_PANE_TITLE`) first, then the lorebook API entry (so imported/user-edited lorebooks override whatever Redux thinks), and only then fall back to Redux world state. **Category is a deliberate exception** — it's an SE-side classification, so managed entities resolve through `entity.categoryId` and only unmanaged entries fall back to `entry.category`. `resolveDisplayName` / `resolveCategoryName` in `src/core/utils/lorebook-strategy.ts` are the canonical implementations. **The DRAFT layer belongs to an attended caller only.** `EDIT_PANE_TITLE` is mirrored on every keystroke, so it is the name the writer is part-way through typing — right for a button they just pressed and are watching, wrong for anything writing on its own, where a half-typed name becomes an entry's header or a thread probe the prose can never match. `resolveDisplayName` therefore takes a required `NameAudience` (`"attended"` / `"unattended"`); the Engine passes `"unattended"` and starts at LOREBOOK.

## Coding Guidelines

- Read `external/script-types.d.ts` to adhere strictly to NovelAI API signatures. Avoid `any` casts, especially with API interactions.
- Trust `.d.ts` files implicitly — do not wrap API calls in defensive existence checks unless handling a documented optional feature.
- Use `api.v1.hooks` (not deprecated `api.v1.events`). Use `api.v1.uuid()` for ID generation.
- No singletons/globals — prefer dependency injection wired in `src/index.ts`.
- Be bold, don't worry about data migration or supporting legacy patterns as we iterate.
- Adhere to the KISS Principle.
- Follow the Boyscout Rule.
- Bump `project.yaml` `version` at most once per pull request. Subsequent commits on the same branch should not bump it again. **Story Engine is in alpha**, so the major version is locked at `0` — `1.0` is reserved for Beta and `2.0` for the production release. That shifts the standard semver rungs down one:
  - **Minor** — the "major"-scale changes (architecture, data model, persisted schema, generation pipeline restructure). These would normally be major bumps, but bump minor while the major is pinned at 0.
  - **Patch** — everything else: quality and accessibility improvements, prompt tuning, UX polish, new non-structural features, and bug fixes. Normally these would split across minor and patch; under the alpha lock they all go to patch.
- Keep `CHANGELOG.md` in step with the in-progress version on every commit that changes user-visible behavior. On the first commit that bumps the version, add a new section for it at the top of the file under the existing Keep-a-Changelog layout (`### Added / Changed / Fixed / Removed`). On subsequent commits to the same PR, trim or refine that section — merge duplicates, drop entries that were reverted, and rewrite bullets as the user-facing story sharpens. The goal is a final changelog entry that reads like a release note, not a commit log.

**DRY in the UI (don't branch render paths on entity state):** Avoid duplicating component construction or splitting `compose()` into "draft vs live" / "empty vs filled" / "isFoo vs isBar" render branches. Each branch is another stale-closure surface and another place to forget when a new field is added. Prefer one render path that always builds every part, and let the parts adapt themselves: `stateProjection`/`requestIdFromProjection` on a `SeGenerationIconButton` so the same button works for drafts and live entities; helpers like `_ensureLiveEntryId` so callers (Save, Generate Content, Generate Keys) don't each reimplement the promote logic. When a callsite genuinely needs different behavior, push the difference into the leaf — never fork the row/column scaffolding above it.

**UI Input Patterns:**

- **Design intents to be idempotent; do not add a tap debounce.** The runtime used to deliver `click` twice for a single mobile tap, and v0.14 wrapped ~40 handlers in a `useTapGuard()` hook to absorb it. That runtime bug is fixed upstream and the hook is gone (removed in 0.14.1) — do not reintroduce a timestamp debounce, and do not write handlers that only work because one is present. What stays is the structural half of the rule, which was always the real fix: carry the data an intent needs **in the action payload**, never through a shared storyStorage slot read asynchronously by the effect (a second dispatch would overwrite the slot before the first read lands), and refuse re-entry in the handler or effect when the work spans an `await` — `flushingRef` in `EntityEditPane`, `genRef` in `useGenField`, the forge effect's concurrent-session check, and the one-entity-per-lorebook-entry reducer invariant are the canonical examples. Those guard against a genuine second press, which a debounce never could.
- **Bind text entry with `onInput`, never `onChange`.** The JSX renderer keeps native DOM semantics (Preact, not React): `input` fires per keystroke, `change` only when a modified field commits — i.e. on blur. An `onChange`-bound field therefore holds stale local state until focus leaves it, so anything reading that state before blur (a Send/Save button) sees the pre-edit value. `tests/ui/text-input-events.test.ts` guards the invariant.

- Prefer `storageKey` on inputs for automatic persistence — avoid manual onChange handlers for simple state sync.
- Exception: Use `onChange` callbacks alongside `storageKey` when syncing to non-UIPart targets (e.g., `api.v1.an.set()`, `api.v1.memory.set()`).
- **Never dispatch actions in `onChange` callbacks.** The reducer overhead is too high for keystroke-frequency events.
- **Do not call `api.v1.lorebook.updateEntry()` in `onChange`.** Lorebook writes happen at explicit commit points (e.g., clicking Save in an edit pane), not on every keystroke. `SeEntityEditPane` is the canonical example: content/keys draft in storyStorage, flushed to lorebook only on Save.
- **`storageKey` inputs are owned by storyStorage — never use `updateParts` to set their value.** Read with `api.v1.storyStorage.get(key)`, write with `api.v1.storyStorage.set(key, value)`, clear with `api.v1.storyStorage.remove(key)`. The input reads from its storageKey automatically. Using `updateParts({ value })` on a storageKey-bound input is incorrect — the stored value and displayed value will diverge.
- **`story:` prefix routing**: In a `storageKey` binding, `story:` is a routing directive the UI framework strips — `storageKey: "story:my-key"` persists under bare key `"my-key"` in storyStorage. `storyStorage.get("my-key")` reads the same slot; `storyStorage.get("story:my-key")` reads a literally different key and is always wrong. Never embed `story:` in storage key constants — add it only at the `storageKey` binding site. Pattern: constant = `"my-key"`, binding = `` `story:${MY_KEY}` ``, direct API = `storyStorage.get(MY_KEY)`. Use `storyStorage.remove(key)` to clear (not `set(key, null)`).

**UI Rendering Rules (JSX tree — SUI and the UIPart header are both gone):**

- **UIParts survive in exactly two places, and neither mutates.** `mount.ts` builds the panel scaffolding (`buildRoot` + the `part.jsx()` body), and `header/opening-scene-modal.ts` builds the Opening Scene modal, because `api.v1.ui.modal.open` takes a `UIPart[]` — an API constraint, not a FlagB workaround. Both construct their specs once and hand them over; parts are frozen objects, so anything that needs to change over time belongs in the Preact tree instead.

- **Never swap a component's _type_ at a fixed position.** `{armed ? <AlertTriangle/> : <Trash2/>}` leaves BOTH svgs in the DOM when the re-render comes from a detached callback — a timer tick or a store subscription rather than a JSX event handler. Mount every variant and toggle `display`, or give each variant its own keyed position in a list. `ConfirmButton.tsx` and `Header.tsx`'s `WidgetIcon` are the two worked examples; the header renders every state it can be in, since all of its renders are detached.

- **First render is already correct.** `useSlice`/`useStream` are built on `useSyncExternalStore`, so they return a real snapshot on mount — there is no "seed the initial value" step. Values that live outside the store need explicit help instead: `getAllowedOutput()` and the budget countdown come from a self-rescheduling `api.v1.timers` tick (`useTick` in `Header.tsx`), and `hasDocumentContent` is read once in `mount.ts` and passed to `App` as a prop so the bootstrap button's first paint carries the right label.

- **`disabled` is not a re-entry guard.** It is a render-time value, so a press arriving before the re-render that sets it still gets through. Where that matters the backstop belongs underneath the button — an in-flight ref across the `await`, or an effect that refuses an id it has already queued (`EntityCard`'s regen bolt relies on the latter). See the idempotence rule under **UI Input Patterns**.

## Key Constraints

- **No DOM:** Runs in QuickJS web worker. No `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **NovelAI API:** Generation via `api.v1.generate()`, storage via `api.v1.storyStorage`, UI via `api.v1.ui`, config via `api.v1.config`.
- **Strict TypeScript:** `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` enabled.
- API types: `external/script-types.d.ts` — the authoritative NovelAI API surface.
