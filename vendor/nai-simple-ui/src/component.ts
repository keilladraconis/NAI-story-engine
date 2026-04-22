/**
 * @file Abstract base class for all sui UIPart components.
 *
 * @description
 * Every UIPart component subclasses `SuiComponent<TTheme, TState, TOptions, TPart>`.
 * Call `build()` to hydrate state from storage and produce a `UIPart`.
 * Call `compose()` directly when used as a child inside a parent container.
 *
 * Shared infrastructure (id, theme, state, storage, setState,
 * resolveTheme, onSync, mergeTheme, buildContent, ids) lives in SuiBase.
 * UIPart-specific members (_composedStyle, searchText, filter(),
 * show(), hide(), removeSelf()) live here.
 *
 * @example <caption>Subclass pattern</caption>
 *   class SuiButton extends SuiComponent<SuiButtonTheme, SuiButtonState, SuiButtonOptions, UIPartButton> {
 *     constructor(options: SuiButtonOptions) { super(options, Theme.button); }
 *     resolveTheme(): SuiButtonStateTheme { return this.state.disabled ? this.theme.disabled : this.theme.default; }
 *     async compose(): Promise<UIPartButton> { return { type: "button", id: this.id, ... }; }
 *   }
 */

export {
  type SuiTheme,
  type ThemeOverride,
  type SuiStorageMode,
  type SuiStylePartTheme,
  type SuiChildrenPartTheme,
  type PartialState,
  type SuiComposable,
  type SuiBaseOptions,
  type SuiFilterResult,
  type SuiComposeContext,
  SuiBase,
} from "./base.ts";

import {
  SuiBase,
  type SuiBaseOptions,
  type SuiTheme,
  type ThemeOverride,
  type SuiComposeContext,
  type SuiFilterResult,
} from "./base.ts";

/**
 * Wildcard `SuiComponent` — use when holding a reference to a component
 * whose type params are unknown (e.g. heterogeneous children arrays).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySuiComponent = SuiComponent<any, any, any, any>;

/**
 * Alias for SuiBaseOptions — the options type for all SuiComponent subclasses.
 * Kept as a named export for backward compatibility with component files.
 */
export type SuiComponentOptions<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = SuiBaseOptions<TTheme, TState>;

/**
 * Abstract base for all sui UIPart components.
 *
 * @template TTheme   - The component's theme type. Structure is always `<state>.<part>.<property>`.
 * @template TState   - The component's state type.
 * @template TOptions - Options type extending SuiComponentOptions.
 * @template TPart    - The specific UIPart type this component produces (e.g. `UIPartButton`).
 */
export abstract class SuiComponent<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends SuiComponentOptions<TTheme, TState> = SuiComponentOptions<
    TTheme,
    TState
  >,
  TPart extends { type: string } & UIPart = { type: string } & UIPart,
> extends SuiBase<TTheme, TState, TOptions> {
  // ── Properties ────────────────────────────────────────────

  /**
   * The theme-owned style captured by this component's compose() implementation.
   * Contains only the component's own resolved theme style (t.self.style) — NOT the
   * positional _baseStyle/_variantStyle imposed by the parent's buildContent().
   *
   * _baseStyle and _variantStyle are set by the parent AFTER build() returns, so they
   * cannot be baked into _composedStyle at compose time. Instead, show()/hide()/visibleStyle()
   * merge all three at call time: { ..._baseStyle, ..._composedStyle, ..._variantStyle }.
   *
   * Used by filter(), show(), hide(), and visibleStyle() to produce the full live style.
   *
   * Initialized in the constructor (not as a class field) to avoid Terser generating a
   * chained __init helper across the SuiBase → SuiComponent inheritance boundary, which
   * the NAI scripting engine cannot handle in compressed output.
   */
  protected _composedStyle: object;

  /**
   * Whether this component is currently visible.
   * Toggled by show()/hide(). Checked by onSync() implementations before pushing style updates —
   * if hidden, display: "none" is merged back in so a setState() call cannot accidentally
   * make a hidden component reappear.
   * Not part of state — never persisted, not theme-driven.
   *
   * Initialized in the constructor for the same Terser/NAI reason as _composedStyle.
   */
  protected _visible: boolean;

  // ── Constructor ───────────────────────────────────────────

  /**
   * @param options    Options including id, theme override, initial state, storageKey, storageMode.
   * @param baseTheme  Component default theme. Merged with options.theme at construction.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(options: TOptions, baseTheme?: ThemeOverride<TTheme> | TTheme) {
    super(options, baseTheme);
    this._composedStyle = {};
    this._visible = options.initialVisible !== false;
  }

  // ── Public action methods ─────────────────────────────────

  /**
   * Hides this component's root UIPart by injecting `display: "none"` into its live style.
   * Sets _visible = false so that subsequent onSync() calls cannot accidentally restore visibility.
   * Merges _baseStyle + _composedStyle + _variantStyle to produce the full effective style —
   * _baseStyle/_variantStyle are positional styles imposed by the parent's buildContent() and
   * must be preserved across show/hide calls.
   * No-op semantics: safe to call when already hidden.
   */
  async hide(): Promise<void> {
    this._visible = false;
    await api.v1.ui.updateParts([
      {
        id: this.id,
        style: {
          ...this._baseStyle,
          ...this._composedStyle,
          ...this._variantStyle,
          display: "none",
        },
      },
    ]);
  }

  /**
   * Restores this component's root UIPart to its last composed style, reversing a hide() call.
   * Sets _visible = true so that subsequent onSync() calls push the full style.
   * Merges _baseStyle + _composedStyle + _variantStyle — same order as buildContent().
   * No-op semantics: safe to call when already visible.
   */
  async show(): Promise<void> {
    this._visible = true;
    await api.v1.ui.updateParts([
      {
        id: this.id,
        style: {
          ...this._baseStyle,
          ...this._composedStyle,
          ...this._variantStyle,
        },
      },
    ]);
  }

  /**
   * Returns the style to apply to this component's root UIPart, respecting current visibility.
   * Merges _baseStyle + the supplied theme style + _variantStyle (same order as buildContent()),
   * then injects `display: "none"` on top when _visible is false.
   * Use this in onSync() passing only t.self.style:
   *
   *   await api.v1.ui.updateParts([{ id: this.id, style: this.visibleStyle(t.self.style) }]);
   *
   * If _visible is false, merges `display: "none"` on top so a setState() call cannot
   * accidentally make a hidden component reappear.
   */
  protected visibleStyle(style: object | undefined): object {
    const full = {
      ...this._baseStyle,
      ...(style ?? {}),
      ...this._variantStyle,
    };
    return this._visible ? full : { ...full, display: "none" };
  }

  /**
   * Removes this component's root UIPart from the live UI by its ID.
   * Use for permanent removal of a rendered part without triggering a full panel rebuild.
   * Do not use this for hide/show toggling — use show()/hide() for that.
   */
  async removeSelf(): Promise<void> {
    await api.v1.ui.removeParts([this.id]);
  }

  // ── Filtering ─────────────────────────────────────────────

  /**
   * The searchable text for this component. Used by filter() to match against a query.
   * Base implementation returns "" — components with user-visible text override this.
   * Multiple fields can be concatenated with a space separator.
   *
   * @example
   *   // SuiCard overrides:
   *   get searchText() { return [this.options.label, this.options.sublabel].filter(Boolean).join(" "); }
   */
  get searchText(): string {
    return "";
  }

  /**
   * Recursively filters this component and its descendants against a query string.
   * Returns visibility and a flat list of updateParts-compatible style updates.
   *
   * Default behaviour:
   *   - If options.children is an AnySuiComponent[], recurse into each child.
   *     This node is visible if any child is visible.
   *   - If options.children is absent or not an array (leaf node with no searchText),
   *     returns { visible: true, updates: [] } — leaf is transparent to filtering.
   *
   * Components with user-visible text override searchText.
   * Components with non-standard child fields (header, sections, etc.) override filter().
   *
   * @param query  The normalised (lowercased) search string. Empty string means show all.
   */
  filter(query: string): SuiFilterResult {
    const optChildren = (this.options as Record<string, unknown>).children;
    if (!Array.isArray(optChildren)) {
      return { visible: true, updates: [] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = optChildren as { filter(q: string): SuiFilterResult }[];
    const results = children.map((c) => c.filter(query));
    const visible = query === "" || results.some((r) => r.visible);
    const updates = results.flatMap((r) => r.updates);
    const full = {
      ...this._baseStyle,
      ...this._composedStyle,
      ...this._variantStyle,
    };
    updates.push({
      id: this.id,
      style: visible ? full : { ...full, display: "none" },
    });
    return { visible, updates };
  }

  // ── Internal build infrastructure ─────────────────────────

  /**
   * Public entry point. Hydrates state from storage then runs compose().
   * Accepts an optional SuiComposeContext that is stored on the instance before compose()
   * is called, making it available to compose() via the protected `composeContext` getter.
   * buildContent() forwards the context automatically to all children.
   * @returns {Promise<TPart>}
   */
  async build(ctx?: SuiComposeContext): Promise<TPart> {
    if (ctx !== undefined) this._setComposeContext(ctx);
    await this.hydrateState();
    const part = await this.compose();
    if (!this._visible) {
      const p = part as unknown as { style?: object };
      p.style = { ...(p.style ?? {}), display: "none" };
    }
    return part;
  }

  /**
   * UIPart factory. Called by `build()` after state is hydrated.
   * Call `resolveTheme()` once at the top to get the resolved part map for the current state.
   * Declare all UIPart fields explicitly — do not spread options or theme.
   * Field order: `type` (literal string), `id`, then options fields, then state fields, then theme fields (`t.self.*`).
   * @internal Do not call directly. Use build() instead.
   * @returns {Promise<TPart>} The fully constructed UIPart for this component.
   */
  abstract compose(): Promise<TPart>;
}
