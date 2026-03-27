# nai-simple-ui

A NovelAI plugin UI component library built on top of the NAI UIPart/UIExtension system.

---

## Architecture Overview

```
SuiBase                  — shared infrastructure for all classes
  ├── SuiComponent       — produces a single UIPart
  ├── SuiOverlay         — opens a modal or window (no UIPart)
  ├── SuiExtension       — registers/updates a UIExtension
  └── SuiPlugin          — top-level plugin orchestrator
```

All four share the same core contract: `build()` hydrates state then calls `compose()`. Subclasses implement `compose()`. The rest is owned by `SuiBase`.

---

## SuiBase (`base.ts`)

The root of every class in the library. Never instantiated directly.

### What it owns

| Member | Description |
|---|---|
| `id` | Stable element ID. Falls back to `api.v1.uuid()` if omitted in options. |
| `options` | Read-only view of construction-time options. |
| `theme` | Fully merged theme (baseTheme + options.theme override). Immutable after construction. |
| `state` | Current state object. Mutate via `setState()` only. |
| `storageKey` | Key used for state persistence. Defaults to `sui.${id}`. |
| `ids` | Map of stable IDs for this instance and any owned children. Base returns `{ self: id }`. |
| `setState(next, applySync?)` | Mutates state, persists to storage, calls `onSync()`, notifies listeners. |
| `subscribe(listener)` | Registers an async state-change listener. Returns an unsubscribe function. |
| `resolveTheme()` | Collapses the state dimension of the theme. Default returns `this.theme.default`. Override in stateful components. |
| `onSync()` | Called automatically by `setState()`. Override to push `updateParts()` calls without a full rebuild. |
| `hydrateState()` | Reads persisted state from storage and assigns it to `_state`. Called by `build()`. |
| `buildContent(children, childrenStyle?)` | Builds an array of `SuiComposable` children into `UIPart[]`, applying `childrenStyle` positional overrides. |
| `mergeTheme(base, override)` | Static. 3-level deep-merge of a theme override onto a base theme. `style` is shallow-merged; all other properties are replaced. |
| `mergePartTheme(base, ...overrides)` | Static. Merges one or more partial state themes onto a complete base state theme. Used inside `resolveTheme()`. |

### `buildContent` and `SuiChildrenPartTheme`

`buildContent(children, childrenStyle?)` is the canonical way to build child component arrays. It:
1. Calls `build()` on each child, forwarding `SuiComposeContext` if present.
2. Applies `childrenStyle` positional overrides on top of each child's root `UIPart` style.

`childrenStyle` is a library-internal type — it is never exposed in options or theme. Components derive it from their `SuiChildrenPartTheme` theme part via `SuiBase.listChildrenStyle(part)`.

**`SuiChildrenPartTheme`** is the universal theme part type for any component that owns a styled container and a list of children. It combines the wrapper container style with per-child positional overrides into a single type. Used for every list zone in the library — `SuiColumnPartTheme` and `SuiRowPartTheme` extend it via intersection to add their layout-specific fields (`spacing`, `alignment`, `wrap`).

```ts
type SuiChildrenPartTheme = {
  style?:     object;   // applied to the wrapper container (SuiRow / SuiColumn / native UIPart)
  base?:      object;   // default baseline applied to every child; child's own style wins over this
  itemFirst?: object;   // merged on top of child's own style for the first child
  itemLast?:  object;   // merged on top of child's own style for the last child
  itemEven?:  object;   // merged on top of child's own style for even-indexed children (0, 2, 4…)
  itemOdd?:   object;   // merged on top of child's own style for odd-indexed children (1, 3, 5…)
};
```

Merge order per child (highest specificity wins):
```
base → child's own style → itemFirst/itemLast/itemEven/itemOdd
```
`base` is a default baseline; child style overrides it. `itemFirst`/etc. are structural exceptions that always win.

**`SuiBase.listChildrenStyle(part: SuiChildrenPartTheme)`** — protected static helper that extracts the positional overrides from a `SuiChildrenPartTheme` into the internal `SuiPositionalPartTheme` format ready to pass to `buildContent()`. Called inside `compose()` when constructing an owned wrapper row/column for a list zone. `SuiPositionalPartTheme` is library-internal and never appears in options or theme types.

### `SuiComposeContext`

A context object threaded top-down through `build()` → `buildContent()` → each child's `build()`. Currently carries `initialQuery?: string` for the search/filter system. Components read it via the protected `composeContext` getter inside `compose()`.

---

## Theming System

### Purpose

Decouple all visual and structural properties from data/behaviour options. The theme is the single source of truth for anything presentational; options carry only data, callbacks, and child content.

### Structure — always 3 levels deep

```
theme[state][part][property]
  e.g. theme.default.self.style
       theme.disabled.self.style
       theme.on.header.text
```

- **state** — `default` (required, always complete) + optional override states (`disabled`, `on`, `pending`, `collapsed`, etc.). Non-default states are partial — merged on top of `default` at resolve time.
- **part** — named regions of the component (`self`, `header`, `body`, `icon`, `pane`, etc.)
- **property** — leaf values (`style`, `text`, `iconId`, `placeholder`, `min`, `max`, `language`, `height`, …)

### Theme types

```ts
// Base constraint — every theme satisfies this shape
type SuiTheme = Record<string, Record<string, Record<string, unknown>>>;

// Minimal part that carries only a style property
type SuiStylePartTheme = { style?: object };

// Universal part for any list zone — wrapper style + per-child positional overrides
type SuiChildrenPartTheme = {
  style?: object;
  base?: object; itemFirst?: object; itemLast?: object; itemEven?: object; itemOdd?: object;
};

// ThemeOverride — what callers pass in options.theme (all keys optional)
type ThemeOverride<T extends SuiTheme> = { [State in keyof T]?: { [Part in keyof T[State]]?: { ... } } };

// PartialState — derives a partial override shape from a StateTheme; used for non-default states
type PartialState<T extends Record<string, Record<string, unknown>>> = { [K in keyof T]?: Partial<T[K]> };
```

### Construction-time merge (`mergeTheme`)

Called in the `SuiBase` constructor. The default theme (`baseTheme`) is deep-merged with any `theme:` override supplied in options, 3 levels deep. `style` objects are shallow-merged; all other properties are replaced.

### Compose-time resolution (`resolveTheme`)

Collapses the state dimension. Stateless components return `this.theme.default` directly. Stateful components stack active state overrides on top via `SuiBase.mergePartTheme()`:

```ts
resolveTheme(): SuiButtonStateTheme {
  return SuiBase.mergePartTheme(
    this.theme.default,
    this.state.disabled ? this.theme.disabled : undefined,
  );
}
```

The result is a flat part map — `t.self.*`, `t.header.*`, etc. — read directly into the emitted `UIPart`.

### In-place reactivity (`onSync`)

Stateful components override `onSync()` to call `api.v1.ui.updateParts()` with the freshly resolved theme values. Fired automatically by `setState()`. This lets the UI reflect state-driven visual changes without a full rebuild or scroll reset.

```ts
override async onSync(): Promise<void> {
  const t = this.resolveTheme();
  await api.v1.ui.updateParts([
    { id: this.ids.label, style: t.label.style },
    { id: this.ids.icon,  style: t.icon.style  },
  ]);
}
```

### Theme files

Every component ships a `theme/` file alongside it containing:
- `SuiXxxPartTheme` — the type for a single named part within a state (e.g. `SuiButtonPartTheme`). Core components always define one. Composite components reference child part types from sibling theme files rather than inlining shapes.
- `SuiXxxStateTheme` — the fully-resolved part map for a single state (what `resolveTheme()` returns). Each part is typed using `SuiXxxPartTheme`, `SuiStylePartTheme`, or `SuiChildrenPartTheme`.
- `SuiXxxTheme` — the top-level theme map: `{ default: SuiXxxStateTheme; disabled?: PartialState<SuiXxxStateTheme>; ... }`. Non-default states use `PartialState<SuiXxxStateTheme>` — derived automatically, never hand-rolled.
- A single camelCase constant named after the component (e.g. `button`, `tabPanel`, `window_`) carrying the library's default values, typed via `satisfies ThemeOverride<SuiXxxTheme>`. Only meaningful values are spelled out; no `undefined` padding.

The component file imports its theme file as a namespace (for the constant) and uses named imports for the types:

```ts
import * as Theme from "./theme/button.ts";
import { type SuiButtonStateTheme, type SuiButtonTheme } from "./theme/button.ts";

// constant passed to super() as the base theme:
super(options, Theme.button);
```

`SuiBase.mergeTheme()` deep-merges `Theme.button` with any `options.theme` override at construction time. In `compose()`, `resolveTheme()` collapses the state dimension and returns a `SuiButtonStateTheme`.

---

## SuiComponent (`component.ts`)

Abstract base for all UIPart-producing components.

```
build(ctx?) → hydrateState() + compose() → TPart
```

- `build(ctx?)` accepts an optional `SuiComposeContext`, stores it, then calls `hydrateState()` + `compose()`.
- `compose()` is abstract. Subclasses implement it to return the typed `UIPart`.

### Subclass pattern

```ts
class SuiButton extends SuiComponent<SuiButtonTheme, SuiButtonState, SuiButtonOptions, UIPartButton> {
  constructor(options: SuiButtonOptions) {
    super(options, Theme.button);
  }
  resolveTheme(): SuiButtonStateTheme { ... }
  async compose(): Promise<UIPartButton> {
    const t = this.resolveTheme();
    return { type: "button", id: this.id, text: t.self.text, style: t.self.style, ... };
  }
}
```

Field order in `compose()` return: `type`, `id`, options fields, state fields, theme fields (`t.self.*`).

### Visibility — `show()` / `hide()`

```ts
await component.hide(); // injects display: "none" into the live UIPart style
await component.show(); // restores the last composed style
```

Toggles the visibility of this component's root UIPart in place via `api.v1.ui.updateParts()`. Safe to call when already in the target visibility state.

`show()` and `hide()` always produce the full effective style by merging `{ ..._baseStyle, ..._composedStyle, ..._variantStyle }` — where `_baseStyle` and `_variantStyle` are the positional styles imposed by the parent's `buildContent()` call (e.g. `opacity`, `padding` from a card's `actions.base`). `updateParts()` replaces style entirely, so all three layers must be sent every time to avoid losing parent-imposed styling.

`_composedStyle` is the component's own resolved theme style (`t.self.style ?? {}`) captured in `compose()`. It is **not** the full merged style — `_baseStyle`/`_variantStyle` are set by the parent **after** `build()` returns and therefore cannot be captured at compose time.

Internally, `hide()` sets `_visible = false` and `show()` sets `_visible = true`. This flag is checked by `visibleStyle(style)` — a protected helper intended for use in `onSync()` implementations that push the root `self` style. Pass the component's theme style; `visibleStyle` handles merging all three layers and injecting `display: "none"` when hidden. This prevents a `setState()` call from inadvertently making a hidden component reappear:

```ts
// In a stateful component's onSync():
override async onSync(): Promise<void> {
  const t = this.resolveTheme();
  await api.v1.ui.updateParts([{ id: this.id, style: this.visibleStyle(t.self.style) }]);
}
```

`_visible` is private instance state — not persisted, not part of the theme or state systems.

### `removeSelf()`

```ts
await component.removeSelf();
```

Permanently removes this component's root UIPart from the live UI via `api.v1.ui.removeParts()`. Use for permanent removal without triggering a full panel rebuild. For temporary toggling use `show()`/`hide()` instead.

### Filtering — `searchText` / `filter()`

```ts
get searchText(): string  // override to expose user-visible text to the filter system
filter(query: string): SuiFilterResult
```

`filter()` recursively matches this component and its descendants against a lowercased query string. Returns `{ visible: boolean, updates: { id, style }[] }` — the flat updates array is ready to pass to `api.v1.ui.updateParts()`. Default behaviour:

- Leaf components (no `children` field) return `{ visible: true, updates: [] }` — transparent to filtering.
- Container components recurse into `children`, visible if any child is visible.

Override `searchText` to expose user-visible text. Override `filter()` directly for non-standard child fields (e.g. `sections`, `header`).

### `AnySuiComponent`

```ts
type AnySuiComponent = SuiComponent<any, any, any, any>;
```

Used wherever a heterogeneous array of components is held (e.g. `children: AnySuiComponent[]`).

---

## SuiOverlay (`overlay.ts`)

Abstract base for modal and window wrappers. Never produces a `UIPart`.

```
build() → hydrateState() + compose() → UIPart[]
open()  → build() + openOverlay(content)
```

### Lifecycle

| Method | Description |
|---|---|
| `compose()` | Default: `buildContent(options.children, listChildrenStyle(t.self))`. Override to build content dynamically. |
| `build()` | `hydrateState()` then `compose()`. Returns `UIPart[]`. |
| `open()` | Calls `build()`, opens the overlay, awaits closure, then returns `TState`. Callers that don't need the result can discard it. |
| `update(partial?)` | No arg: full rebuild. Partial: pushes scalar fields to the live handle without rebuilding. |
| `updateOverlay(fields)` | Protected. Pushes fields directly to the live handle. Called from `onSync()`. |
| `close()` | Programmatically closes the overlay. No-op if not open. |
| `closed` | Promise that resolves when the overlay is dismissed. Prefer awaiting `open()` to get the state result on close; use `closed` directly only when you need to observe closure without having called `open()` yourself. |
| `isOpen` | Whether the overlay is currently open. |

### `SuiOverlayOptions`

```ts
type SuiOverlayOptions = {
  children?: AnySuiComponent[];
} & SuiBaseOptions;
```

Per-item positional styles for overlay children are carried by the theme's `self` part (`SuiChildrenPartTheme`). The default `compose()` reads them via `SuiBase.listChildrenStyle(t.self)`.

### `openOverlay` — abstract

Subclasses implement this to call the appropriate NAI API:

```ts
// SuiModal:
protected async openOverlay(content: UIPart[]): Promise<SuiOverlayHandle> {
  const t = this.resolveTheme();
  return api.v1.ui.modal.open({ id: this.id, title: t.self.title, ... content });
}
```

### Theme-driven overlay properties

All presentational overlay properties (`title`, `size`, `hasMinimumHeight`, `fillWidth` for modals; `title`, `defaultWidth/Height`, `defaultX/Y`, `minWidth/Height`, `maxWidth/Height`, `resizable` for windows) live in theme, not options. `onSync()` pushes updated values to the live handle via `updateOverlay()` after every `setState()` call.

---

## SuiExtension (`extension.ts`)

Abstract base for all NAI `UIExtension` wrappers.

```
build() → hydrateState() + compose() → TExt
```

### Lifecycle

| Method | Description |
|---|---|
| `register()` | Calls `build()` then `api.v1.ui.register()`. No-op if already registered. |
| `update(partial?)` | No arg: full rebuild. Partial: merges fields onto the registered extension in place. No-op if not registered. |
| `remove()` | Calls `api.v1.ui.remove()` and resets the registration flag. |
| `init` | `boolean` — whether currently registered. |
| `type` | The `UIExtension` type literal (e.g. `"sidebarPanel"`). |

### Subclass pattern

```ts
class SuiSidebarPanel extends SuiExtension<"sidebarPanel", UIExtensionSidebarPanel, TTheme, TState, TOptions> {
  constructor(options) { super(options, "sidebarPanel", SUI_SIDEBAR_PANEL_THEME); }
  resolveTheme(): SuiSidebarPanelStateTheme { return this.theme.default; }
  async compose(): Promise<UIExtensionSidebarPanel> {
    const t       = this.resolveTheme();
    const content = await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.self));
    return { type: this.type, id: this.id, name: this.options.name, content };
  }
}
```

---

## SuiPlugin (`plugin.ts`)

Abstract orchestrator for a complete NAI script plugin. Subclass once per plugin.

```
start() → requestPermissions() → _checkMeta() → build() → registerHooks()
build() → hydrateState() + compose()
```

### Lifecycle

| Method | Description |
|---|---|
| `requestPermissions()` | Abstract, sync. Called first in `start()`, before any `await`. |
| `compose()` | Abstract. Constructs and registers all `SuiExtension` instances. Save references to private fields for use in `registerHooks()`. |
| `registerHooks()` | Abstract. Registers all `api.v1.hooks` callbacks. |
| `build()` | Concrete. `hydrateState()` then `compose()`. |
| `start()` | Orchestrates the full init sequence. |
| `onVersionChange(isFirstLoad)` | Virtual. Called when script version changes. Base is a no-op. |
| `metaKey` | Virtual getter. Returns the storage key for the version meta record. Override or return `undefined` to skip. |

### Minimal subclass

```ts
class MyPlugin extends SuiPlugin {
  private _panel?: SuiSidebarPanel;

  protected requestPermissions(): void {
    api.v1.permissions.request(["lorebookEdit"]);
  }

  protected async compose(): Promise<void> {
    this._panel = new SuiSidebarPanel({ id: "my-panel", name: "My Plugin", children: [...] });
    await this._panel.register();
  }

  protected async registerHooks(): Promise<void> {
    api.v1.hooks.register("onGenerationRequested", async () => { ... });
  }
}

new MyPlugin({ id: "my-plugin" }).start();
```

---

## Storage

State persistence is controlled by `storageMode` in options:

| Mode | Backend | Scope |
|---|---|---|
| `"memory"` | In-memory only | Not persisted (default) |
| `"story"` | `api.v1.storyStorage` | Per story |
| `"global"` | `api.v1.storage` | Per script install |
| `"history"` | `api.v1.historyStorage` | Per story; reverts on undo |
| `"temp"` | `api.v1.tempStorage` | Per session; cleared on story close |

`storageKey` defaults to `sui.${id}`. `hydrateState()` is called by `build()` before `compose()`. External callers can also call `hydrateState()` directly to pre-read a component's stored state before constructing dependent siblings.

---

## Filtering System

`SuiComponent.filter(query)` cascades a search query through the component tree. Each component returns `{ visible: boolean, updates: { id, style }[] }`. The updates array is flat and ready to pass directly to `api.v1.ui.updateParts()`.

- **Leaf components** (no `children` field) return `{ visible: true, updates: [] }` — transparent to filtering.
- **Container components** recurse into `children`, are visible if any child is visible.
- Components with user-visible text override `searchText`.
- Components with non-standard child fields (e.g. `sections`) override `filter()` directly.
- `_composedStyle` — captured by each `compose()` implementation as the component's own resolved theme style (`t.self.style ?? {}`). It does **not** include `_baseStyle` or `_variantStyle` (parent-imposed positional styles set by `buildContent()` after `build()` returns). `show()`, `hide()`, `visibleStyle()`, and `filter()` all merge `{ ..._baseStyle, ..._composedStyle, ..._variantStyle }` at call time to produce the full effective style — ensuring parent positional styles (e.g. `opacity`, `padding` from a card's `actions.base`) are preserved across visibility transitions.

`SuiFilterPanel` drives this system live: on every keystroke its internal `SuiTextInput` calls `listCol.filter(query)` and batches all returned updates — including any expand/restore updates from owned `SuiCollapsible` children — into a single `api.v1.ui.updateParts()` call. The query is persisted via `searchStorageKey`/`searchStorageMode` and replayed at compose time via `SuiComposeContext` so initial filter state is baked into emitted `UIPart` styles without a subsequent `updateParts` call. Pass `debounceDelay` (ms) in options to debounce the `onChange` handler via lodash `debounce`; omit it to fire on every keystroke.

---

## Component Catalogue

### Layout

| Component | UIPart type | Description |
|---|---|---|
| `SuiColumn` | `column` | Vertical flex container. `children`. Item styles via `theme.default.self` (`SuiColumnPartTheme`). |
| `SuiRow` | `row` | Horizontal flex container. `children`. Item styles via `theme.default.self` (`SuiRowPartTheme`). |
| `SuiBox` | `box` | Generic box. `children`. Item styles via `theme.default.self`. |
| `SuiContainer` | `container` | Scrollable container. `children`. Item styles via `theme.default.self`. |

### Composite layout

| Component | UIPart type | Description |
|---|---|---|
| `SuiCard` | `row` | Structured card: icon, label, sublabel, actions row, toggle. Stateful (`disabled`, `selected`). `selected` stacks before `disabled` in `resolveTheme()`. Actions item styles via `theme.default.actions` (`SuiChildrenPartTheme`). |
| `SuiCollapsible` | `column` | Header + collapsible content. Stateful (`collapsed`, `disabled`). Owns a chevron `SuiButton`. If header is `SuiCard`, its callbacks are auto-wired. |
| `SuiCollapsibleSection` | `collapsibleSection` | Simplified collapsible with a label header. `children`. Item styles via `theme.default.self`. |
| `SuiFilterPanel` | `column` | Two-zone: search input → scrollable list. Stateful (`query`). `children`. Item styles via `theme.default.list` (`SuiColumnPartTheme`). Optional `debounceDelay` (ms). Pair with `SuiActionBar` for footer actions. |
| `SuiTabBar` | `column` | Tab bar + pane switcher. Stateful (`activeTab`). `tabs` (SuiButton[]), `panes`, `actions?`. Tab-button item styles via `theme.default.tabs` (`SuiChildrenPartTheme`). Action item styles via `theme.default.actions` (`SuiChildrenPartTheme`). Pane item styles via `theme.default.content` (`SuiChildrenPartTheme`). |
| `SuiActionBar` | `row` | Horizontal action footer with optional `left` and `right` sub-rows. Stateless. Item styles via `theme.default.left` and `theme.default.right` (`SuiChildrenPartTheme`). Sub-rows only emitted when non-empty. |
| `SuiSectionedList` | `column` | List of named sections (`sections`), each with its own `children`. Section shell item styles via `theme.default.section` (`SuiChildrenPartTheme`). Per-section item styles via `theme.default.children` (`SuiChildrenPartTheme`). |

### Inputs

| Component | UIPart type | Description |
|---|---|---|
| `SuiButton` | `button` | Clickable. `text`, `iconId`, `style` from theme. `callback` in options. Stateful (`disabled`). |
| `SuiConfirmButton` | `button` | Two-step confirm button. First click primes; second click fires. Stateful (`pending`). |
| `SuiToggle` | `toggle` | On/off toggle. Stateful (`on`). |
| `SuiCheckboxInput` | `checkbox` | Checkbox. Stateful (`checked`, `disabled`). |
| `SuiTextInput` | `textInput` | Single-line text input. `placeholder`, `style` from theme. `onChange` callback in options. |
| `SuiMultilineTextInput` | `multilineTextInput` | Multi-line text area. `height` from theme. |
| `SuiNumberInput` | `numberInput` | Numeric input. `min`, `max`, `step` from theme. |
| `SuiSliderInput` | `sliderInput` | Range slider. `min`, `max`, `step` from theme. |
| `SuiCodeEditor` | `codeEditor` | Code editor. `language`, `height` from theme. |

### Display

| Component | UIPart type | Description |
|---|---|---|
| `SuiText` | `text` | Static text. `text`, `style` from theme. |
| `SuiImage` | `image` | Image display. `src`, `width`, `height` from theme. |

---

## Extension Catalogue

All extensions extend `SuiExtension` and follow the same `register()` / `update()` / `remove()` lifecycle.

| Class | UIExtension type | Has content |
|---|---|---|
| `SuiSidebarPanel` | `sidebarPanel` | Yes — `children`. Item styles via `theme.default.self` (`SuiChildrenPartTheme`). |
| `SuiScriptPanel` | `scriptPanel` | Yes — `children`. Item styles via `theme.default.self` (`SuiChildrenPartTheme`). |
| `SuiLorebookPanel` | `lorebookPanel` | Yes — `children`. Item styles via `theme.default.self` (`SuiChildrenPartTheme`). |
| `SuiToolboxOption` | `toolboxOption` | Optional — `children?`. Item styles via `theme.default.self` (`SuiChildrenPartTheme`). |
| `SuiToolbarButton` | `toolbarButton` | No |
| `SuiContextMenuButton` | `contextMenuButton` | No |

---

## Overlay Catalogue

| Class | NAI API | Theme-driven properties |
|---|---|---|
| `SuiModal` | `api.v1.ui.modal.open()` | `self.title`, `self.size`, `self.hasMinimumHeight`, `self.fillWidth` |
| `SuiInfoModal` | (subclasses `SuiModal`) | `self.title`, `self.size`, `message.text`, `message.markdown`, `message.style`, `dismiss.text`, `dismiss.style` |
| `SuiConfirmModal` | (subclasses `SuiOverlay`) | `self.title`, `self.size`, `message.text`, `message.markdown`, `message.style`, `confirm.text/style`, `cancel.text/style` |
| `SuiWindow` | `api.v1.ui.window.open()` | `self.title`, `self.defaultWidth`, `self.defaultHeight`, `self.defaultX`, `self.defaultY`, `self.minWidth`, `self.minHeight`, `self.maxWidth`, `self.maxHeight`, `self.resizable` |

### `SuiInfoModal`

Simple informational modal — title, markdown message, optional dismiss button. Stateless. All content and style live in theme. The dismiss button is shown when `theme.default.dismiss.text` is non-empty; omit or clear it to suppress.

```ts
// Static content entirely in theme:
await new SuiInfoModal({
  theme: {
    default: {
      self:    { title: "No Trigger Configured" },
      message: { text: "**Entry** has no keys and is not Always On.", markdown: true },
    },
  },
}).open();

// Dynamic content injected via mergeTheme — static framing in a named constant,
// only the runtime-variable field added at the call site:
await new SuiInfoModal({
  theme: SuiBase.mergeTheme(Theme.myInfoModal, {
    default: { message: { text: `**"${entry.name}"** something dynamic.` } },
  }),
}).open();
```

### `SuiConfirmModal`

Two-button confirmation modal — title, markdown message, confirm and cancel buttons. Stateful (`confirmed: boolean`). `open()` returns `{ confirmed: boolean }` — `true` only if the confirm button was pressed; `false` if cancel or the native X was used.

```ts
const { confirmed } = await new SuiConfirmModal({
  theme: {
    default: {
      self:    { title: "Delete group?" },
      message: { text: "This action cannot be undone.", markdown: true },
      confirm: { text: "Delete", style: { background: "#c0392b", color: "#fff" } },
    },
  },
}).open();
if (confirmed) { ... }
```

---

## Import Map

All public exports are available from the root barrel:

```ts
import { SuiButton, SuiCard, SuiColumn, SuiModal, SuiSidebarPanel, SuiPlugin, ... } from "nai-simple-ui";
```

Internal structure for reference:

```
nai-simple-ui/
  base.ts              — SuiBase + all shared types (SuiChildrenPartTheme, SuiStylePartTheme, PartialState, …)
  component.ts         — SuiComponent, AnySuiComponent, re-exports from base
  overlay.ts           — SuiOverlay, SuiOverlayOptions, SuiOverlayHandle
  extension.ts         — SuiExtension
  plugin.ts            — SuiPlugin, SuiPluginOptions
  components/          — all UIPart component classes + their theme/ files
  extensions/          — all UIExtension wrapper classes + their theme/ files
  overlays/            — SuiModal, SuiWindow + their theme/ files
  index.ts             — root barrel (re-exports everything)
```

---

## Rules

- Library theme files export a single camelCase constant named after the component (`button`, `tabPanel`, etc.) using `satisfies ThemeOverride<SuiXxxTheme>`. Only spell out meaningful values — no `undefined` padding, no screaming-uppercase constants.
- Components override `build()` to load async data, then call `compose()`. `compose()` is always sync-structured and always builds fresh.
- `rebuildCallback` in options is the only mechanism for triggering a full panel rebuild after mutations.
- UI can only be changed two ways: `api.v1.ui.update()` rebuilds the entire registered tree — required whenever nodes are added or removed. `api.v1.ui.updateParts()` updates style/content on already-existing parts in place.
- Any mutation that adds or removes nodes must trigger a full `api.v1.ui.update()`.
- `compose()` may only be called from within `build()` in the same class.
- **All presentational properties live in theme. Options carry only data, callbacks, and child content.**
- Every list zone in a component is represented by a `SuiChildrenPartTheme` part — it carries both the wrapper container style and per-item positional overrides. `SuiColumnPartTheme` and `SuiRowPartTheme` extend it via intersection to add layout-specific fields.
- `SuiBase.listChildrenStyle` is the only bridge between a `SuiChildrenPartTheme` part and the internal `buildContent()` positional system. The internal type is never exposed in options or theme types.
