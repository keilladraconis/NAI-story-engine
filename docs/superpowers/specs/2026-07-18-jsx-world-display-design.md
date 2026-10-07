# JSX World Section — Display Layer

**Date:** 2026-07-18
**Status:** Approved (design)
**Branch:** v14

## Context

The SUI→JSX migration has landed the Chat tab and the Foundation fields. The
JSX "Story Engine" tab (`src/ui-jsx/App.tsx`) currently renders only
`<Foundation/>`. In SUI, that tab (`ForgePane`) stacks three sections —
Foundation, Forge, World — plus a HeaderBar.

This slice migrates the **World section display layer**: the reactive rendering
of Threads and entity cards below Foundation. The two edit panes
(`SeEntityEditPane`, 580 lines; `SeThreadEditPane`, 245 lines) and the Forge
section are deferred to following slices.

Reference SUI components:

- `src/ui/components/SeWorldSection.ts` (400) — collapsible "World" section.
- `src/ui/components/SeEntityCard.ts` (382) — entity card.
- `src/ui/components/SeThreadItem.ts` (438) — thread card.

## Goals

- Render the World section below Foundation in the JSX Story Engine tab: Threads
  (with their member entity cards) and "loose" live entity cards, reactive to
  store changes.
- Entity cards show category icon, name, collapsible summary, and a **store-only**
  status border (draft / pending / incomplete).
- Thread cards show a layers icon, title, and their member entity cards.
- Included actions (all existing one-dispatch store effects): World SEGA
  start/stop, expand/collapse-all, world clear (confirm), entity regen bolt,
  entity discard (confirm), thread delete.
- Deferred affordances render **shown-but-disabled**: add-entity, add-thread,
  thread lorebook toggle; entity + thread names are non-interactive text.

## Non-Goals

- No `SeEntityEditPane` / `SeThreadEditPane` (next slice).
- No entity/thread creation wiring (add buttons are disabled).
- No thread lorebook toggle behavior (disabled).
- No full lorebook-completeness (green) border — deferred to the entity-edit
  slice, which handles lorebook reads anyway.
- No store/effect/prompt/slice changes — every action/selector already exists.
- No Forge section, no HeaderBar (later slices).

## Reference behavior (from SUI, verified)

- **`SeWorldSection`**: header (World + globe icon; actions SEGA start/stop,
  expand/collapse, add-entity `+`, add-thread `layers`, clear `trash-2` confirm)
  - body (SeThreadItem per visible group, SeEntityCard per loose live entity).
    `_selectBody`: groups with ≥1 non-forge-draft member; loose = live entities
    not in any group and not forge drafts.
- **`SeEntityCard`**: category icon + name (click → edit pane) + collapsible
  summary + status border. Border: draft (blue), else pending (orange) /
  complete (green) / incomplete (grey), where complete needs summary **and**
  async lorebook text+keys. Actions: live → regen bolt (`entityRegenRequested`);
  draft → discard confirm (`entityDiscardRequested`).
- **`SeThreadItem`**: layers icon + title (click → edit pane) + actions
  [lorebook toggle, delete]. **Delete is an immediate `groupDeleted` dispatch,
  no confirm.** The doc-comment mentions "reforge" but no reforge button exists
  in the code — there is nothing to migrate. Content: SeEntityCard per member.

## File Layout

New folder `src/ui-jsx/panels/world/`, plus one shared component:

- `world-select.ts` — pure, framework-free helpers:
  - `selectWorldBody(entitiesById, groups) → { groups: WorldGroup[]; loose: WorldEntity[] }`
    — mirrors SUI `_selectBody`.
  - `entityPending(runtime, entityId) → boolean` — true if any of the entity's
    four request ids (`se-entity-summary-<id>`, `entity-summary-bind-<id>`,
    `lb-entity-<id>-content`, `lb-entity-<id>-keys`) is in `runtime.activeRequest`,
    `runtime.queue`, or `runtime.sega.activeRequestIds`.
  - `entityBorderKind(entity, pending) → "draft" | "pending" | "incomplete"`.
  - `CATEGORY_ICON: Record<string, string>` — categoryId → feather icon name
    (dramatisPersonae→user, universeSystems→cpu, locations→map-pin,
    factions→shield, situationalDynamics→activity, topics→hash).
- `World.tsx` — the section. Header row (World + globe, section-collapse chevron,
  expand/collapse-all, SEGA start/stop, disabled add-entity, disabled add-thread,
  clear-confirm) + body. Renders `<Foundation/>`'s sibling under the engine tab.
- `ThreadItem.tsx` — thread card (layers, title text, disabled lorebook toggle,
  delete, member `EntityCard`s).
- `EntityCard.tsx` — entity card (icon, name text, collapsible summary, border,
  regen bolt / discard-confirm).
- `components/ConfirmButton.tsx` — shared arm→confirm button (new
  `src/ui-jsx/components/` dir for cross-panel components).
- `App.tsx` — the engine-tab scroll box renders `<Foundation/>` then `<World/>`.

## Reactivity

Preact makes this simpler than SUI's manual `updateParts` + JSON-snapshot
memoization:

- `World` selects `s.world.entitiesById` and `s.world.groups` via two `useSlice`
  calls. Both are store-owned references that change identity only on a world
  mutation, so the component re-renders exactly when the world changes. It then
  computes `selectWorldBody(entitiesById, groups)` in render (pure, cheap) and
  maps groups → `<ThreadItem key={g.id}>` and loose → `<EntityCard key={e.id}>`.
- `EntityCard` selects its own entity (`s.world.entitiesById[entityId]` — stable
  ref), `worldExpanded`, and `entityPending(...)` (boolean). No async in render.
- `ThreadItem` selects its group (`s.world.groups.find(...)` — stable ref) and
  `worldExpanded`.
- **Keys are mandatory** on all mapped lists (prior keyed-reconciliation bugs in
  this codebase — see the chat ordering fix).

`useSlice` compares snapshots by `Object.is`; entity/group object refs and the
boolean/array selectors are all stable, so no render loop. `entitiesById` and
`groups` are object/array refs (not fresh objects), safe under `Object.is`.

## Status Border (store-only)

Per the approved scope, no async lorebook reads this slice:

- `draft` → blue tint (`rgba(120,180,255,0.4)` border-left) — but expressed via a
  theme token where possible (see Coloring).
- live + `entityPending` → orange (pending).
- live otherwise → grey (incomplete).

The green "complete" state (summary + lorebook text + keys) is deferred to the
entity-edit slice. The same `entityPending` signal dims/disables the regen bolt,
reusing the Foundation `FieldCard` generating pattern.

Threads carry no status border this slice (SUI computes one from member
aggregate; deferred — a neutral card is fine).

## Actions

Included (existing one-dispatch effects; import paths noted):

- **SEGA start/stop** — `segaToggled` (`core/store` barrel). Two-state button
  driven by `runtime.segaRunning`.
- **Expand/collapse-all** — `worldExpansionSet({ expanded })` (barrel via
  `slices/ui`); reads `ui.worldExpanded ?? true`.
- **World clear** — `worldCleared` (barrel via `slices/world`) behind
  `ConfirmButton`.
- **Entity regen bolt** — `entityRegenRequested({ entityId })` from
  `core/store/effects/summary-generation`. Dims while `entityPending`.
- **Entity discard** — `entityDiscardRequested({ entityId })` from
  `core/store/effects/forge-chat-effects` (also re-exported from barrel) behind
  `ConfirmButton`. Draft cards only.
- **Thread delete** — `groupDeleted({ groupId })` (barrel via `slices/world`).
  Immediate, matching SUI (no confirm).

Section-level collapse (whole World body) is local `useState`, ephemeral,
matching SUI's `initialCollapsed: false`.

## ConfirmButton

`src/ui-jsx/components/ConfirmButton.tsx`. Props: `{ onConfirm: () => void;
title: string; icon; timeoutMs?: number (default 4000) }`. First click → armed
state (warning icon/color); second click within the timeout → `onConfirm()` +
reset; timeout elapses → auto-reset. Uses `api.v1.timers.setTimeout` /
`clearTimeout` (no `setTimeout` in QuickJS). Armed state is local `useState`; the
pending timer id is tracked in a `useRef` and cleared on unmount/confirm.

## Coloring

All colors from `T.*` theme tokens (`src/ui-jsx/style.ts`) — no static hex.
The status-border colors (blue draft, orange pending, grey incomplete) and the
confirm "armed" warning color may need tokens that do not yet exist; add them to
`style.ts` rather than inlining hex. `T.warning` already exists for the armed
state; `T.midIntensity`/`T.textDisabled` cover other cases. A blue "draft" token
is added if none fits.

## Deferred = shown-disabled

add-entity, add-thread, and the thread lorebook toggle render with disabled
styling (reduced opacity, `cursor: default`, no `onClick`). Entity and thread
names render as plain text (not buttons). This keeps the header/card layout
faithful to SUI while the edit panes and creation flows land next slice.

## Testing

- `world-select.ts` pure functions, vitest:
  - `selectWorldBody`: forge drafts excluded from loose and from group membership
    counts; a group whose only members are drafts is hidden; loose = live,
    non-grouped, non-draft; grouped entities excluded from loose.
  - `entityPending`: true when a matching id is in activeRequest / queue /
    sega.activeRequestIds; false otherwise.
  - `entityBorderKind`: draft entity → "draft"; live+pending → "pending";
    live+not-pending → "incomplete".
- Components: `npx tsc --noEmit` gate + live-harness verification (render Threads
  - loose entities from an existing world side-by-side with SUI; expand/collapse;
    SEGA toggle; clear/discard confirm arm→fire; regen bolt dims while pending;
    disabled affordances inert).

## Risks / Notes

- `isForgeDraft` lives in `core/store/selectors/forge`; reuse it in
  `selectWorldBody` rather than reimplementing the draft check.
- The same entity can appear in multiple threads; keys must be unique per
  context. Use `key={`${groupId}:${entityId}`}` inside a thread's member list and
  `key={entityId}` for loose cards, mirroring SUI's per-context DOM ids.
- No document/lorebook writes in this slice — pure display + cheap dispatches
  keeps risk low.
- `entityRegenRequested` and `entityDiscardRequested` import from their effect
  modules (not all re-exported from the barrel); follow the SUI import paths.
