# JSX Foundation Fields — Full SeFoundationSection Parity

**Date:** 2026-07-17
**Status:** Approved (design)
**Branch:** v14

## Context

The SUI→JSX migration has landed the Chat tab. The Story Engine tab currently
renders `src/ui-jsx/panels/Foundation.tsx`, which implements only two of the six
Narrative Foundation fields: **ATTG** and **Style**.

The SUI reference (`src/ui/components/SeFoundationSection.ts`) renders six field
cards, in this order:

1. **Intensity** — a 5-level picker (Cozy → Nightmare) with a description; no edit
   pane, no generate.
2. **Shape** — name + description; two-field edit pane; zap is **generate-only**
   (SUI uses `SeGenerationIconButton`, not the gen/refine pair).
3. **Intent** — single textarea; unified generate/refine.
4. **Contract** — single textarea authored as `REQUIRED:/PROHIBITED:/EMPHASIS:`,
   parsed to `ContractData` on save; unified generate/refine.
5. **ATTG** — single textarea; unified generate/refine; sync-to-Memory toggle.
6. **Style** — single textarea; unified generate/refine; sync-to-A.N. toggle.

This spec brings the JSX panel to full parity with all six fields, and adds a
**generating indicator** to every card's zap button (SUI shows one via
`stateProjection`; the shipped JSX ATTG/Style do not).

`worldState` lives in `FoundationState` but is **not** rendered in this section in
SUI either — it is out of scope here.

## Goals

- Render all six Foundation fields in the JSX Story Engine tab.
- Each card-field: display derived text, an Edit pane, a zap (generate/refine),
  and — for ATTG/Style — a sync toggle.
- Zap shows a **generating** state while a matching foundation request is queued
  or active, uniformly across all five card-fields.
- Keep one render path driven by a config table; push per-field differences into
  data, not branches (repo DRY-UI guidance).

## Non-Goals

- No `worldState` UI.
- No changes to store slices, effects, prompts, or generation strategies — the
  actions and runtime state all already exist.
- No SUI removal in this pass; `SeFoundationSection` stays until the JSX panel is
  the sole UI.

## File Layout

New folder `src/ui-jsx/panels/foundation/`. The existing single-file
`src/ui-jsx/panels/Foundation.tsx` is replaced by:

- `Foundation.tsx` — orchestrator. Store selectors, the `editing` state machine,
  renders `<IntensityPicker>` then `.map()` over `FIELD_DESCRIPTORS` into
  `<FieldCard>`s. When `editing` is set, renders `<FieldEditor>` instead.
- `FieldCard.tsx` — generic card: label, derived display text, actions row
  (Edit, Zap, optional Sync toggle). Subscribes to the generating selector and,
  while generating, disables the zap and shows a spinner/pulsing state.
- `FieldEditor.tsx` — the current single-textarea editor, generalized to
  optionally render a **title** input above the content textarea (Shape's
  name + description). Uses `useDraftField` for both title and content.
- `IntensityPicker.tsx` — the 5 wrapping level buttons + description text.
  Clicking a level dispatches `intensityUpdated`. Selected level gets the green
  tint; others are dimmed.
- `fields.ts` — pure config: `INTENSITY_LEVELS` and the `FIELD_DESCRIPTORS`
  array. Framework-free where practical (dispatch closures live here, but the
  data shape is testable).

`src/ui-jsx/App.tsx` updates its import path from `./panels/Foundation` to
`./panels/foundation/Foundation`. No other App change (it already renders
`<Foundation />` inside the Story Engine tab's scroll box).

## Field Descriptor

Drives Shape, Intent, Contract, ATTG, Style (the five card-fields):

```ts
type FoundationFieldId = "shape" | "intent" | "contract" | "attg" | "style";

type FieldDescriptor = {
  id: FoundationFieldId;
  label: string;                 // card label; Shape overrides with the shape name
  titled?: boolean;              // Shape only — editor shows a title input
  hasRefine: boolean;            // false for Shape (generate-only); true otherwise
  hasSync?: boolean;             // ATTG, Style
  display: (s: RootState) => string;        // derived card text
  cardLabel?: (s: RootState) => string;     // Shape: name || "Shape"; else label
  seed: (s: RootState) => { title: string; content: string }; // opens editor
  commit: (draft: { title: string; content: string }) => void; // dispatch + sync
  generate: () => void;          // dispatch <field>GenerationRequested
  refineSource: (s: RootState) => string;   // text handed to refine
  placeholder: string;
  titlePlaceholder?: string;     // Shape only
};
```

Per-field specifics captured by the descriptor:

- **Shape**: `titled: true`, `hasRefine: false`. `cardLabel` = `shape?.name ||
  "Shape"`. `display` = `shape?.description || "(empty)"`. `seed` =
  `{ title: shape?.name ?? "", content: shape?.description ?? "" }`. `commit` =
  dispatch `shapeUpdated` with `{ name: title || "STORY", description: content }`
  when either is non-empty, else `null`.
- **Intent**: single field. `commit` → `intentUpdated`. `refineSource` = intent.
- **Contract**: single textarea seeded/displayed as the `REQUIRED:/PROHIBITED:/
  EMPHASIS:` triple. `seed` formats the current `ContractData` (empty string if
  null). `commit` parses the three lines (regex `^REQUIRED:\s*(.+)$` etc., same
  as SUI) → `contractUpdated`, or `null` on empty. `display` formats as
  `Required: … Prohibited: … Emphasis: …`. `refineSource` = the R/P/E block.
- **ATTG / Style**: single field. `commit` dispatches `attgUpdated`/`styleUpdated`
  then `void syncMemory()`. `hasSync: true`. `refineSource` = the field value.

`syncMemory()` (unchanged from current Foundation.tsx) pushes ATTG→Memory and
Style→A.N. when their sync toggles are on. It is called after ATTG/Style commit
and after a sync-toggle flip. It lives in `fields.ts` or a shared helper module.

## Generating Indicator

One selector, mirroring SUI's `foundationProjection`:

```ts
function isFoundationGenerating(s: RootState, fieldId: FoundationFieldId): boolean {
  const inQueue = s.runtime.queue.some(
    (r) => r.type === "foundation" && r.targetId === fieldId,
  );
  const active =
    s.runtime.activeRequest?.type === "foundation" &&
    s.runtime.activeRequest.targetId === fieldId;
  return inQueue || active;
}
```

`FieldCard` reads `useSlice((s) => isFoundationGenerating(s, id))`. While true:
the Zap button is disabled and renders a generating affordance (a spinner icon, or
the existing `Zap` icon pulsing / dimmed). Intensity has no foundation request,
so it never shows the indicator.

## Zap Routing

Unchanged from the shipped `decideFieldAction(text)` helper: an **empty** field
generates; a **non-empty** field opens a refine (`uiChatRefineRequested`). The
exception is Shape (`hasRefine: false`) — its zap always calls `generate()`.

The App already surfaces the Chat tab when a `refine` chat is created
(`chatCreated`/`chatSwitched` effects in `App.tsx`), so refine wiring needs no
new tab-switch code — the descriptors just dispatch `uiChatRefineRequested`.

## Intensity Picker

`INTENSITY_LEVELS` (Cozy, Grounded, Gritty, Noir, Nightmare) with the same
descriptions as SUI. Buttons wrap (`flexWrap: "wrap"`). Selected level uses the
NAI header highlight (`T.textHeadings`, the yellowish heading color) — full
opacity, header-colored text, on a subtle `T.bg3` chip background; unselected:
`T.textDisabled` / ~0.4 opacity, no background. (This replaces SUI's green
`rgba(144,238,144,0.15)` literal.) Clicking dispatches
`intensityUpdated({ intensity: { level, description } })`. Below the buttons, a
text line shows the selected level's description (or "No intensity defined").

## Coloring

All colors come from the `T.*` theme tokens in `src/ui-jsx/style.ts` (which map
to NAI theme CSS custom properties) — no static hex literals. Headings/labels use
`T.textHeadings`, body text `T.text`, empty/dimmed text `T.textDisabled`, card
surfaces `T.bg2`, chips `T.bg3`. The sync-toggle "on" state keeps `T.midIntensity`
(green in the default theme), matching the shipped ATTG/Style toggles. If a token
is missing for a needed color, add it to `style.ts` rather than inlining a hex.

## Display / Escaping

SUI's `escapeDisplay` (doubling newlines, escaping `<`) is a markdown-part
concern and is **dropped** — JSX renders text nodes directly with
`whiteSpace: "pre-wrap"`, so newlines render literally and `<` is safe.

## Testing

- `fields.ts` is the testable surface. Unit-test the pure pieces:
  - Contract `commit` parsing: a well-formed `REQUIRED:/PROHIBITED:/EMPHASIS:`
    block → correct `ContractData`; empty → `null`; partial → empty strings for
    missing lines (matching SUI regex behavior).
  - Contract/Shape `display` and `seed` round-trips.
  - `decideFieldAction` already tested; `isFoundationGenerating` gets a small
    table test against a mock `RootState`.
- Manual/harness verification in the running panel: each field's Edit → Save,
  each zap (generate on empty, refine on filled → Chat tab), Intensity selection
  persistence, ATTG/Style sync toggles, and the generating indicator appearing
  while a request is queued.

## Risks / Notes

- **Textarea seeding**: keep the uncontrolled-textarea pattern already documented
  in `Foundation.tsx` (child text seeds display; `onInput` tracks edits). The
  titled editor applies the same pattern to two inputs.
- **File growth**: the split keeps each file focused; `Foundation.tsx` becomes an
  orchestrator, not a monolith.
- No store/effect/prompt changes — this is pure UI parity, lowering risk.
