# SUI Migration Plan

Migrating Story Engine's UI layer from nai-act/nai-store to nai-simple-ui. The generation pipeline (GenX, strategies, handlers, effects) stays on nai-store. The UI becomes self-contained SuiComponent subclasses that own their own state, themes, and update logic.

## Why

nai-act adapts a React/Redux mental model to NovelAI's imperative UIPart system. The bridge between reactive subscriptions and imperative `updateParts` calls is where all the bugs live:

- `useSelector`/`bindPart` don't fire on mount — every component needs dual initialization paths
- Closure state (timers, mode flags, form values) tracked across multiple `useSelector` callbacks is fragile
- No component-local state — everything is global store or closure variables
- Updating a container's `content` via `updateParts` re-applies all child specs, wiping direct child updates
- `storageKey` routing (`story:` prefix stripping) creates subtle divergence bugs

nai-simple-ui eliminates the bridge. `compose()` produces the UIPart tree. `setState()` + `onSync()` pushes targeted updates. No subscription layer to get wrong.

Additional wins:
- **Self-contained components**: state, theme, callbacks, and update logic in one file — no scattering across slices/effects/handlers
- **Theme system**: immutable 3-level themes (state/part/property) with construction-time merging replaces ad-hoc `mergeStyles` calls
- **Component library**: SuiCard, SuiFilterPanel, SuiCollapsible, SuiTabBar, SuiActionBar, overlays — rich building blocks out of the box
- **Built-in persistence**: `storageMode` per component ("story", "global", "temp", "memory") replaces manual storyStorage wiring

---

## Structural Change: One Sidebar, Tabbed

### Current layout (3 extensions)

```
Brainstorm Sidebar (kse-brainstorm-sidebar)
├── BrainstormHeader
├── Message List (bindList)
└── Input (Send/Clear)

Story Engine Sidebar (kse-sidebar)
├── Header (S.E.G.A. controls, marquee, budget feedback)
├── NarrativeFoundation (Shape, Intent, ATTG, Style, Tensions)
├── ForgeSection (Guidance, Forge button, Batch name, Entity list)
├── WorldBatchList (bindList → BatchSection → EntityCards)
└── Footer (Relationships, Bind, Clear Forge)

Lorebook Panel (kse-lorebook-panel)
├── Empty / Unmanaged / Managed views
├── Content + Keys editors
├── Refine instructions
└── Relationships list
```

### Target layout (1 extension, tabbed)

```
Story Engine Sidebar (SuiSidebarPanel)
├── HeaderBar (S.E.G.A. controls, status)
└── SuiTabBar
    ├── Tab: Brainstorm
    │   └── BrainstormPane (two modes, toggled by header controls)
    │       ├── [Chat mode] — active conversation
    │       │   ├── ChatHeader (session title, mode selector, switch to sessions)
    │       │   ├── MessageList (scroll container)
    │       │   └── InputBar (multiline + send + clear)
    │       │
    │       └── [Sessions mode] — saved session browser
    │           ├── SessionsHeader (back to chat, new session)
    │           └── SessionList (SuiFilterPanel)
    │               └── SessionCards (SuiCard per session)
    │                   ├── Title (editable), date, message count
    │                   ├── Load / Delete actions
    │                   └── Tags or labels (guidance, critique, rewrite)
    │
    ├── Tab: Forge
    │   └── ForgePane
    │       ├── FoundationSection (SuiCollapsible)
    │       │   ├── ShapeRow (editable + gen button)
    │       │   ├── IntentRow (editable + gen button)
    │       │   ├── ATTGRow (multiline + sync toggle)
    │       │   ├── StyleRow (multiline + sync toggle)
    │       │   └── TensionsList
    │       ├── ForgeControls (guidance, forge button, batch name)
    │       ├── DraftEntities (SuiCollapsible, entity cards)
    │       └── ActionBar (Cast All, Discard All, Clear)
    │
    └── Tab: World
        └── WorldPane (two modes, like simple-context's inline edit pattern)
            ├── [Browse mode]
            │   ├── BatchList (SuiCollapsible per batch)
            │   │   └── EntityCards (with regen/reforge/move/delete)
            │   │       └── Card tap → opens inline lorebook editor
            │   └── ActionBar (Relationships, Bind, Rebind)
            │
            └── [Edit mode] (replaces browse content inline)
                └── SeLorebookEditor
                    ├── BackButton (returns to browse)
                    ├── Entry name + lifecycle badge
                    ├── Content editor (multiline + gen button)
                    ├── Keys editor (text input + gen button)
                    ├── Refine instructions + gen button
                    └── Relationships list + add form
```

### Why three tabs instead of two

Brainstorm and Forge are separate workflows. Combining them in one scrollable panel (current design) forces users to scroll past Foundation fields to reach the forge, or past brainstorm history to reach Foundation. Tabs give each workflow its own scroll context.

World gets its own tab because the batch/entity list can grow large and has its own action set (relationships, binding, reforging). Keeping it alongside Forge controls means the Forge UI shifts position as entities are cast.

### Lorebook editing: inline in World tab

The current Lorebook Panel is a separate script extension triggered by `onLorebookEntrySelected`. This creates a disconnected experience — the user edits entities in one sidebar and their lorebook content in another.

The new design follows simple-context's inline edit pattern: tapping an entity card in the World tab replaces the browse view with the lorebook editor inline. A back button returns to the batch/entity list. This keeps everything in one sidebar with one scroll context.

The `onLorebookEntrySelected` hook still works — it switches to the World tab and opens the editor for that entry. The separate lorebook script extension is removed entirely.

This is the same pattern simple-context uses for `LoreEditPanel` / `GroupEditPanel`: the plugin tracks an `_editPane` field, and `compose()` branches on whether it's set to render either browse or edit mode.

---

## Hybrid Architecture: Three-Tier State Model

State lives in one of three tiers, chosen by a single litmus test: **does an effect, strategy, or context-builder read this state during generation?**

### Tier 1: Component-local state (`this.state` + `setState()`)

State that belongs to a single component instance and no other code needs to see.

| Examples | Why local |
|----------|-----------|
| Collapsed/expanded | Only the collapsible cares |
| Timer countdown, animation frame | Rendering detail |
| Button mode (gen/queue/cancel/wait) | Derived from store, but the derived mode is local |
| Input draft text (via `storageMode`) | Persisted by SUI automatically, no other component reads it |
| Disabled/selected visual state | Theme-driven, component-owned |

Updated via `setState()` → `onSync()` → `updateParts()`. No external coordination needed.

### Tier 2: Plugin-shared state (plugin singleton fields + methods)

State that multiple components need to read or coordinate on, but that **no effect or generation strategy ever touches**. This is the tier that eliminates most of the current `ui` slice.

The `StoryEnginePlugin` singleton owns this state as plain fields, exposes it via methods, and triggers `panel.update()` (recompose) when it changes. Components import the plugin and read directly — no subscriptions, no dispatch.

| State | Current location | Why plugin-shared |
|-------|-----------------|-------------------|
| Active editor ID | `ui.activeEditId` | Multiple EditableText instances coordinate (singleton pattern), but no effect reads it |
| World tab edit entry ID | `ui.lorebook.selectedEntryId` | WorldPane branches compose() on it; `onLorebookEntrySelected` hook sets it — but no strategy reads it |
| Brainstorm pane mode | (new) | Chat vs sessions — purely navigational |
| Brainstorm input draft | `ui.brainstorm.input` | Only the input component reads it |
| Edit dirty flag | (new) | Confirm-on-close coordination between editor and back button |
| Temporary input values | `ui.inputs` | Shared between components in a form, but no effect reads them |

**Pattern** (same as simple-context):

```typescript
class StoryEnginePlugin extends SuiPlugin<...> {
  private _activeEditId: string | null = null;
  private _worldEditEntryId: string | null = null;
  private _brainstormMode: "chat" | "sessions" = "chat";
  private _editDirty = false;

  // Components call these directly — no dispatch, no reducer
  openLorebookEditor(entryId: string) {
    this._worldEditEntryId = entryId;
    this._panel.switchToWorldTab();
    this._panel.update();  // recompose with editor visible
  }

  closeLorebookEditor(force = false) {
    if (!force && this._editDirty) return this._confirmDiscard();
    this._worldEditEntryId = null;
    this._editDirty = false;
    this._panel.update();  // recompose back to browse
  }

  // Components read directly in compose()
  get worldEditEntryId() { return this._worldEditEntryId; }
  get brainstormMode() { return this._brainstormMode; }
}
```

Components access the plugin via singleton import:

```typescript
import { plugin } from "../plugin-ref";

// In WorldPane.compose():
if (plugin.worldEditEntryId) {
  return this.buildEditMode(plugin.worldEditEntryId);
} else {
  return this.buildBrowseMode();
}

// In entity card callback:
new SuiButton({
  callback: () => plugin.openLorebookEditor(entity.lorebookEntryId)
})
```

No subscriptions. No cleanup. Components read current state at compose time, and the plugin triggers recompose when shared state changes.

### Tier 3: Global store (nai-store slices + effects)

State that the **generation pipeline reads** — effects, strategies, context-builder, handlers. This is the only state that needs the full dispatch → reduce → subscribe cycle.

| Slice | Why global |
|-------|-----------|
| `runtime` | Generation queue, SEGA orchestration, GenX state, budget tracking — consumed by every generation-capable component and by effects |
| `brainstorm` | Chat history consumed as context by Foundation, Forge, and Bootstrap strategies |
| `foundation` | Shape, intent, tensions, ATTG, style — read by context-builder for every generation |
| `world` | Entities, batches, relationships — read by context-builder, mutated by effects (forge, cast, SEGA) |
| `crucible` | Phase machine, elements, build passes — driven by effects chain |
| `story` | Fields and DULFS items — read by context-builder, mutated by handlers |

The `ui` slice is **deleted entirely**. Everything it held moves to Tier 1 (component-local) or Tier 2 (plugin-shared).

**Effects, strategies, handlers** — unchanged. They dispatch to and read from nai-store. The UI layer is the only thing that changes.

### The bridge: store → components

Components that need to **react to store changes** (Tier 3 → Tier 1) use `store.subscribeSelector()`:

```typescript
// In a SuiComponent's compose() or a setup method:
this._unsub = store.subscribeSelector(
  (state) => state.runtime.genx.status,
  (status) => this.setState({ genxStatus: status })
);
```

Components that need to **trigger store changes** call `store.dispatch()` directly in callbacks:

```typescript
new SuiButton({
  callback: () => store.dispatch(actions.forgeRequested({ guidance }))
})
```

Components that need **shared UI coordination** (Tier 2) call plugin methods — no subscriptions needed because the plugin triggers recompose.

### Store subscription cleanup

Components that subscribe to the global store (Tier 3 → Tier 1 bridge) must unsubscribe when the panel rebuilds. A thin helper manages this:

```typescript
class StoreWatcher {
  private unsubs: (() => void)[] = [];

  watch<T>(selector: (s: RootState) => T, listener: (val: T) => void) {
    this.unsubs.push(store.subscribeSelector(selector, listener));
  }

  dispose() {
    this.unsubs.forEach(fn => fn());
    this.unsubs = [];
  }
}
```

Each component that bridges to the store creates a `StoreWatcher`, and the plugin disposes all watchers before each recompose. Note that Tier 2 (plugin-shared) state requires **no subscriptions and no cleanup** — components read it at compose time, and the plugin triggers recompose when it changes.

---

## Component Migration Map

### New SUI components to build

Components listed roughly in dependency order (leaves first).

#### Leaf components (no store dependency, reusable)

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeGenerationButton` | `SuiComponent` | `GenerationButton.ts` (607 LOC) | Watches `runtime.queue`, `runtime.activeRequest`, `runtime.genx` via StoreWatcher. Manages mode state machine (gen/queue/cancel/continue/wait/disabled) and timer internally via `setState` + `onSync`. Two variants: button and icon. |
| `SeEditableText` | `SuiComponent` | `EditableText.ts` (314 LOC) | View/edit toggle. Uses `storageMode: "story"` for draft persistence. Singleton pattern (one active editor at a time) managed by plugin-level state, not a store slice. |
| `SeConfirmButton` | `SuiConfirmButton` | `ButtonWithConfirmation.ts` (97 LOC) | Direct mapping — SUI already has this. |
| `SeBudgetFeedback` | `SuiComponent` | `BudgetFeedback.ts` (125 LOC) | Watches `runtime.genx` via StoreWatcher for wait/continue state. |

#### Brainstorm tab — Chat mode

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeMessage` | `SuiComponent` | `Message.ts` (94 LOC) | Editable message with retry/delete. Watches own message content from `brainstorm` slice. |
| `SeMessageList` | `SuiColumn` | `List.ts` (32 LOC) | Rebuilt on message list changes (store subscription). Reversed order. |
| `SeBrainstormInput` | `SuiComponent` | `Input.ts` (76 LOC) | Multiline + send (SeGenerationButton) + clear. |
| `SeChatHeader` | `SuiComponent` | `BrainstormHeader.ts` (111 LOC) | Session title, mode selector (cowriter/critic/guidance/rewrite), summarize, "Sessions" button to switch modes. |

#### Brainstorm tab — Sessions mode

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeSessionCard` | `SuiCard` | (replaces `SessionsModal.ts` list items) | Card per saved session — title (editable), message count sublabel, load/delete actions. Tags or labels for session type (guidance, critique, rewrite). Searchable via SuiFilterPanel. |
| `SeSessionsHeader` | `SuiComponent` | (new) | Back-to-chat button, new session button. |
| `SeSessionList` | `SuiFilterPanel` | (new) | Filterable list of SeSessionCards. Search by title, tag, content. |

#### Brainstorm tab — Pane

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `BrainstormPane` | `SuiComponent` | (new) | Two-mode component (chat vs sessions), same inline-switch pattern as WorldPane. Chat mode: header + messages + input. Sessions mode: header + filterable session list. Tracks `_mode: "chat" | "sessions"` — compose() branches on it. |

#### Foundation section (inside Forge tab)

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeTensionRow` | `SuiCard` | `TensionRow.ts` (93 LOC) | Editable tension with resolve/delete. Card with toggle (resolved state). |
| `SeFoundationSection` | `SuiCollapsible` | `NarrativeFoundation.ts` (241 LOC) | Shape, Intent, ATTG, Style fields + tensions list. Each field is a row with SuiMultilineTextInput + SeGenerationButton. ATTG/Style have sync toggles (SuiToggle). |

#### Forge section (inside Forge tab)

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeEntityCard` | `SuiCard` | `EntityCard.ts` (274 LOC) | Draft vs live variants via theme states. Draft: discard button. Live: reforge + regen + move + delete. Name: summary display via card label + sublabel. |
| `SeForgeControls` | `SuiComponent` | `ForgeSection.ts` (150 LOC) | Guidance input, forge button, batch name input. |
| `ForgeDraftList` | `SuiCollapsible` | (part of ForgeSection) | Draft entities in a collapsible with Cast All / Discard All actions. |

#### World tab

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeBatchSection` | `SuiCollapsible` | `BatchSection.ts` (84 LOC) | Batch header with reforge button, entity cards as children. |
| `WorldPane` | `SuiComponent` | `WorldBatchList.ts` (23 LOC) + footer + `LorebookPanelContent.ts` (585 LOC) | Two modes: browse (batch list + action bar) and edit (SeLorebookEditor). Tracks `_editEntryId` — when set, compose() renders editor instead of browse. Entity card tap and `onLorebookEntrySelected` hook both set this. Back button clears it. Follows simple-context's `plugin.editPane` / `rebuildPanel()` pattern. |
| `SeMoveModal` | `SuiModal` | `MoveModal.ts` (146 LOC) | Batch reassignment. |
| `SeBindModal` | `SuiModal` | `BindModal.ts` (328 LOC) | Bind/rebind with category detection. |
| `SeRelationshipsModal` | `SuiModal` | `RelationshipsModal.ts` (327 LOC) | Relationship overview grouped by entity. |

#### Lorebook editor (inline in World tab)

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeLorebookEditor` | `SuiComponent` | `LorebookPanelContent.ts` (585 LOC) | Inline entry editor shown when user taps an entity card or `onLorebookEntrySelected` fires. Replaces WorldPane's browse content (simple-context edit-mode pattern). Back button returns to browse. Content/keys/refine editors + relationship list + add form. Managed vs unmanaged entry handling. |

#### Top-level orchestration

| Component | SUI Base | Replaces | Notes |
|-----------|----------|----------|-------|
| `SeHeaderBar` | `SuiComponent` | `Header.ts` (281 LOC) | S.E.G.A. toggle, status marquee, budget feedback. Watches `runtime.sega`, `runtime.genx`. |
| `StoryEnginePlugin` | `SuiPlugin` | `index.ts` init logic | Owns store instance, registers hooks, manages panel lifecycle. |
| `StoryEnginePanel` | `SuiSidebarPanel` | Both sidebar registrations | Header + SuiTabBar(Brainstorm, Forge, World). |

### What gets deleted

- `src/ui/framework/editable-draft.ts` — singleton pattern moves to plugin state
- `src/ui/colors.ts` — absorbed into themes
- `src/ui/utils.ts` — `escapeForMarkdown` stays as utility; visibility/height helpers replaced by SUI
- All nai-act `defineComponent` files — replaced by SuiComponent subclasses
- `src/core/store/slices/ui.ts` — all state moves to components
- The nai-act dependency itself

### What stays unchanged

- `src/core/store/slices/runtime.ts` — all actions/state
- `src/core/store/slices/brainstorm.ts` — all actions/state
- `src/core/store/slices/foundation.ts` — all actions/state
- `src/core/store/slices/world.ts` — all actions/state
- `src/core/store/slices/crucible.ts` — all actions/state
- `src/core/store/slices/story.ts` — all actions/state
- All effects files
- All strategy/handler files
- `src/core/utils/context-builder.ts`
- `gen-x` integration

---

## Migration Order

Migrate bottom-up: leaf components first, then composite panels, then the top-level plugin. Each phase should produce a working build.

### Phase 0: Setup

1. Add nai-simple-ui as a dependency (copy into `external/` or npm link)
2. Create `src/ui-sui/` directory for new components (parallel to old `src/ui/`)
3. Build the `StoreWatcher` bridge utility
4. Create base theme file (`src/ui-sui/theme/`) with Story Engine's color palette and shared styles
5. Create the `StoryEnginePlugin` skeleton (extends SuiPlugin)

### Phase 1: Leaf components

Build and unit-test independently of the main app:

1. `SeGenerationButton` — the hardest single component; get this right first
2. `SeEditableText` — used everywhere; needs singleton editor coordination
3. `SeConfirmButton` — trivial wrap of SuiConfirmButton
4. `SeBudgetFeedback` — small, good test of StoreWatcher pattern

### Phase 2: Brainstorm tab

1. `SeMessage`, `SeBrainstormInput`, `SeChatHeader` — chat mode components
2. `SeSessionCard`, `SeSessionsHeader`, `SeSessionList` — sessions mode components
3. `BrainstormPane` — two-mode pane (chat / sessions), owns brainstorm store subscription
4. Wire into a temporary standalone SuiSidebarPanel for testing

### Phase 3: Forge tab

1. `SeTensionRow`, `SeFoundationSection`
2. `SeEntityCard` (draft + live variants via theme)
3. `SeForgeControls`, `ForgeDraftList`
4. `ForgePane` — composes Foundation + Forge controls + draft list

### Phase 4: World tab + inline lorebook editor

1. `SeBatchSection` — batch header with reforge button, entity cards as children
2. `SeLorebookEditor` — the inline entry editor (content/keys/refine/relationships)
3. `WorldPane` — two-mode component (browse vs edit), entity card tap opens editor
4. `SeMoveModal`, `SeBindModal`, `SeRelationshipsModal`

### Phase 5: Top-level assembly

1. `SeHeaderBar` with marquee and SEGA controls
2. `StoryEnginePanel` with SuiTabBar (Brainstorm, Forge, World)
3. `StoryEnginePlugin` — full lifecycle (permissions, hooks, compose, version tracking)
4. Migrate `index.ts` to use StoryEnginePlugin instead of nai-act mount calls
5. Wire `onLorebookEntrySelected` hook to switch to World tab + open editor for that entry
6. Remove old lorebook script extension registration

### Phase 6: Cleanup

1. Delete `src/ui/` (old nai-act components)
2. Delete `src/core/store/slices/ui.ts` and remove from root reducer
3. Remove nai-act dependency
4. Rename `src/ui-sui/` → `src/ui/`

---

## Key Design Decisions

### Lorebook editing: inline in World tab (decided)

Lorebook editing lives inside the World tab as an inline edit mode, following simple-context's `editPane` / `rebuildPanel()` pattern. See "Lorebook editing: inline in World tab" section above for details. The separate lorebook script extension is removed.

Entry points into the editor:
- **Entity card tap** in World tab browse mode
- **`onLorebookEntrySelected` hook** (from NAI's native lorebook sidebar) — switches to World tab, opens editor
- **SEGA completion** — could auto-open the last generated entry (optional UX enhancement)

The editor handles both managed (Story Engine owns) and unmanaged (manually created) entries. For unmanaged entries, a "Bind" action adopts the entry into Story Engine's world model.

### List rebuilds vs in-place updates

nai-simple-ui uses full `compose()` rebuilds for structural changes (adding/removing items). This causes scroll reset. For lists that change during generation (entity forging, brainstorm messages), we need to decide:

- **Accept scroll reset** on structural changes (simpler, matches simple-context)
- **Use `SuiFilterPanel`** for stable lists with search (World batches)
- **Batch structural updates** to minimize rebuild frequency (e.g., queue multiple entity additions, rebuild once)

### GenerationButton: SUI component or custom pattern?

GenerationButton is the most complex component (608 LOC, 6 modes, timer, dual variants). Options:

- **Full SuiComponent subclass** with rich state (`{ mode, timerEnd, hasContent }`) and `onSync()` — most aligned with SUI patterns
- **Composition of SUI primitives** (SuiButton + SuiToggle + timer logic) — might be cleaner but more wiring

Leaning toward full subclass — it's a unique component with behavior that doesn't map to any existing SUI component.

### Theme scope

- **Global theme file** for Story Engine brand (colors, spacing, typography)
- **Per-component theme overrides** for specific states (generation button modes, entity card lifecycles)
- **Shared part themes** for recurring patterns (editable rows, section headers)

---

## Risks

1. **Scroll reset on rebuild.** The current nai-act design avoids full rebuilds via `bindList` + targeted `updateParts`. SUI's `compose()` rebuilds will cause scroll jumps when lists change. Mitigation: batch updates, use SuiFilterPanel for stable lists, accept some scroll reset during active generation.

2. **Store subscription cleanup.** Every store-bridged component needs cleanup on rebuild. If missed, subscriptions accumulate and fire on stale component references. Mitigation: StoreWatcher utility with explicit `dispose()`, enforced by plugin lifecycle.

3. **Migration duration.** ~5,200 LOC of UI across 23 components. Parallel old/new during migration means temporary code duplication. Mitigation: phase-by-phase approach with working builds at each phase.

4. **Generation streaming.** Current handlers call `api.v1.ui.updateParts()` directly to stream text into the UI. In SUI, streaming updates need to flow through component state. This means handlers need a way to reach the relevant component's `setState()` — likely via a registry or callback pattern.

---

## Streaming Integration Pattern

Generation handlers currently call `updateParts` directly. Post-migration, they need to update SUI component state instead.

**Option A: Component registry.** Components register themselves by target ID. Handlers look up the component and call `setState()`.

```typescript
// Component registers on compose:
streamRegistry.register(targetId, (text) => this.setState({ streamedText: text }));

// Handler streams:
streamRegistry.get(targetId)?.(accumulatedText);
```

**Option B: Store-mediated streaming.** Handlers dispatch streaming text to a store slice. Components subscribe. This keeps the handler → store → UI flow consistent but adds a dispatch per stream chunk.

**Option C: Keep updateParts for streaming.** Streaming is the one case where direct `updateParts` is justified — it's high-frequency, append-only, and the component's `onSync()` doesn't need to know about intermediate states. The component reads final state from the store on completion.

Leaning toward **C** for simplicity — streaming is a special case where the SUI abstraction isn't worth the overhead. The component's `compose()` sets up the text view, streaming writes to it directly, and the completion handler updates the store (which triggers the component's store subscription for final state).
