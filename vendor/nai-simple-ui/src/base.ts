/**
 * @file Abstract base class for all sui components and overlays.
 *
 * @description
 * `SuiBase` provides the shared infrastructure inherited by both `SuiComponent`
 * (UIPart factories) and `SuiOverlay` (modal/window wrappers).
 *
 * Shared: id, options, theme, state, storage, setState(),
 *         resolveTheme(), onSync(), mergeTheme(), buildContent(), ids.
 *
 * `SuiComponent` extends SuiBase — adds compose(), build(), _composedStyle,
 *                                  searchText, filter(), show(), hide(), removeSelf().
 * `SuiOverlay`   extends SuiBase — adds open(), update(), close(), closed.
 */

/**
 * Result returned by `filter()`. Contains whether this node is visible after filtering,
 * and all `updateParts`-compatible style updates for this node and its descendants.
 */
export type SuiFilterResult = {
  visible: boolean;
  updates: { id: string; style: object }[];
};

/**
 * Context threaded through build() → buildContent() → each child's build().
 * Components read from this to apply compose-time behaviour (e.g. initial filter visibility)
 * without requiring callers to pass data through every constructor.
 *
 * @property {string} [initialQuery] - Lowercased filter query to bake into emitted UIPart styles.
 */
export type SuiComposeContext = {
  initialQuery?: string;
};

/**
 * Base constraint for all sui themes.
 * Structure is always <state>.<part>.<property> — exactly 3 levels deep.
 *   state    — e.g. "default", "disabled", "readOnly". "default" is always complete.
 *              Non-default states are partial: merged on top of "default" at resolveTheme() time.
 *   part     — e.g. "self", "header", "body"
 *   property — leaf values. Scalar properties are replaced. "style" is shallow-merged.
 */
export type SuiTheme = Record<string, Record<string, Record<string, unknown>>>;

/**
 * Purpose-built override type for sui themes. Reflects the fixed 3-level structure.
 * All levels are optional — only supply what you want to override.
 * Property values at the third level are replaced wholesale, not deep-merged.
 */
export type ThemeOverride<T extends SuiTheme> = {
  [State in keyof T]?: {
    [Part in keyof T[State]]?: {
      [Prop in keyof T[State][Part]]?: T[State][Part][Prop];
    };
  };
};

/**
 * Storage backend for a component's state.
 *   "memory"  — in-memory only; not persisted. Default.
 *   "story"   — api.v1.storyStorage; persisted per story.
 *   "global"  — api.v1.storage; persisted with the script.
 *   "history" — api.v1.historyStorage; story-stored, reverts on undo.
 *   "temp"    — api.v1.tempStorage; cleared when story closes.
 */
export type SuiStorageMode = "memory" | "story" | "global" | "history" | "temp";

/**
 * Positional style overrides applied to each child in a `children` array.
 * Library-internal type — never exposed in options or theme directly.
 * Combined with `SuiStylePartTheme` to form the public `SuiChildrenPartTheme`.
 * Merge order per child (highest specificity wins):
 *   base → child's own style → itemFirst/itemLast/itemEven/itemOdd
 */
type SuiPositionalPartTheme = {
  base?: object;
  itemFirst?: object;
  itemLast?: object;
  itemEven?: object;
  itemOdd?: object;
};

/**
 * Minimal theme part that carries only a style property.
 * Used as a standalone part type in composite StateTheme types where no other properties are needed.
 */
export type SuiStylePartTheme = { style?: object };

/**
 * Derives a partial state override type from a complete StateTheme type.
 * Used as the type for all non-default states in a theme (e.g. `disabled?`, `on?`, `pending?`).
 * Every part key is optional, and every property within each part is optional.
 * Replaces hand-rolled `PartialSuiXxxStateTheme` types that duplicated the full StateTheme shape.
 *
 * @example
 *   export type SuiButtonTheme = {
 *     default:   SuiButtonStateTheme;
 *     disabled?: PartialState<SuiButtonStateTheme>;
 *   };
 */
export type PartialState<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T]?: Partial<T[K]>;
};

/**
 * Universal theme part for any component that owns a styled container and a list of children.
 * Intersection of `SuiStylePartTheme` (wrapper container style) and `SuiPositionalPartTheme`
 * (per-child positional overrides).
 *
 * `style`     — applied to the wrapper container (SuiRow / SuiColumn / native UIPart).
 * `base`      — default baseline applied to every child; child's own style wins over this.
 * `itemFirst` — merged on top of child's own style for the first child.
 * `itemLast`  — merged on top of child's own style for the last child.
 * `itemEven`  — merged on top of child's own style for even-indexed children (0, 2, 4…).
 * `itemOdd`   — merged on top of child's own style for odd-indexed children (1, 3, 5…).
 */
export type SuiChildrenPartTheme = SuiPositionalPartTheme & SuiStylePartTheme;

/**
 * Structural type for anything that can be composed into a UIPart.
 * Used by buildContent() to accept AnySuiComponent without a circular import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SuiComposable = { build(): Promise<any> };

/**
 * Base options type shared by SuiComponent and SuiOverlay subclasses.
 *
 * @property {string}               [id]             - Stable element ID. Falls back to api.v1.uuid() if omitted.
 * @property {ThemeOverride<TTheme>} [theme]          - Per-instance override merged over baseTheme at construction.
 * @property {TState}               [state]           - Initial state; seeds _state at construction.
 * @property {string}               [storageKey]      - Key for state persistence. Defaults to `sui.${id}`.
 * @property {SuiStorageMode}       [storageMode]     - Storage backend. Defaults to "memory" (not persisted).
 * @property {boolean}              [initialVisible]  - SuiComponent only. When false, the component starts
 *                                                      hidden (display:none baked into the emitted UIPart style).
 *                                                      Call show() to make it visible later. Defaults to true.
 */
export type SuiBaseOptions<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  id?: string;
  theme?: ThemeOverride<TTheme>;
  state?: TState;
  storageKey?: string;
  storageMode?: SuiStorageMode;
  initialVisible?: boolean;
};

/**
 * Shared abstract base for SuiComponent and SuiOverlay.
 *
 * @template TTheme   - The theme type. Structure is always `<state>.<part>.<property>`.
 * @template TState   - The state type. State-driving values (disabled, query, activeIndex, etc.).
 * @template TOptions - Options type extending SuiBaseOptions.
 */
export abstract class SuiBase<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends SuiBaseOptions<TTheme, TState> = SuiBaseOptions<
    TTheme,
    TState
  >,
> {
  // ── Public properties ─────────────────────────────────────

  /**
   * The `base` positional style applied to this component by its parent's buildContent() call.
   * Contains only the parent-imposed baseline (the `base` key from SuiPositionalPartTheme) —
   * never any state-driven values from the component's own theme.
   * Set once per full rebuild by buildContent(); never updated by setState() or onSync().
   * Used by stateful onSync() as the low-specificity baseline: base → child → variants.
   */
  protected _baseStyle: object = {};

  /**
   * The variant positional style applied to this component by its parent's buildContent() call.
   * Contains the merged itemFirst/itemLast/itemEven/itemOdd overrides for this child's position.
   * Applied after child's own style so positional variants always win.
   * Set once per full rebuild by buildContent(); never updated by setState() or onSync().
   */
  protected _variantStyle: object = {};

  // ── Private properties ────────────────────────────────────

  private _id: string;
  private _options: TOptions;
  private _state: TState;
  private _storageKey: string;
  private _storageMode: SuiStorageMode;
  private _theme: TTheme;
  /**
   * Compose-time context injected by build(). Read by compose() implementations
   * via the protected `composeContext` getter.
   * Set immediately before compose() is called; cleared after.
   */
  private _composeContext: SuiComposeContext | undefined = undefined;

  // ── Constructor ───────────────────────────────────────────

  /**
   * @param options    Options including id, theme override, initial state, storageKey, storageMode.
   * @param baseTheme  Component default theme. Merged with options.theme at construction via mergeTheme().
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(options: TOptions, baseTheme?: ThemeOverride<TTheme> | TTheme) {
    this._id = options.id ?? api.v1.uuid();
    this._options = options;
    this._state = { ...((options.state ?? {}) as TState) };
    this._storageKey = options.storageKey ?? `sui.${this._id}`;
    this._storageMode = options.storageMode ?? "memory";
    this._theme = SuiBase.mergeTheme(
      (baseTheme ?? {}) as TTheme,
      (options.theme ?? {}) as ThemeOverride<TTheme>,
    );
  }

  // ── Public getters ────────────────────────────────────────

  /** The component's stable identifier. Falls back to a generated uuid if not supplied in options. */
  get id(): string {
    return this._id;
  }

  /**
   * Stable element IDs for this component and its owned children.
   * Base implementation returns `{ self: this.id }`.
   * Composite subclasses override to add child keys derived from `this.id`:
   *   `header: \`${this.id}.header\``
   *   `items:  \`${this.id}.items\``
   * For arrays, suffix with index: `\`${this.id}.section.0\``.
   */
  get ids(): { self: string } {
    return { self: this.id };
  }

  /** Read-only view of the options passed at construction. */
  get options(): Readonly<TOptions> {
    return this._options;
  }

  /** The fully merged theme (baseTheme + options.theme override). Immutable after construction. */
  get theme(): TTheme {
    return this._theme;
  }

  /** The current state. Mutate via `setState()` — never assign directly. */
  get state(): TState {
    return this._state;
  }

  /**
   * The resolved storage key for this instance's state.
   * Defaults to `sui.${id}` if not supplied in options.
   */
  get storageKey(): string {
    return this._storageKey;
  }

  // ── Public action methods ─────────────────────────────────

  /**
   * The canonical way to mutate state. Execution order:
   *   1. Assign _state.
   *   2. Persist to storage (if storageMode !== "memory").
   *   3. Call onSync() (if applySync is true).
   *   4. Notify external listeners concurrently.
   *
   * @param next       The next state object to assign.
   * @param applySync  Pass `false` to mutate state silently (e.g. hydrating from storage at startup).
   */
  async setState(next: TState, applySync: boolean = true): Promise<void> {
    this._state = next;

    if (this._storageMode !== "memory") {
      switch (this._storageMode) {
        case "story":
          await api.v1.storyStorage.set(this._storageKey, this._state);
          break;
        case "global":
          await api.v1.storage.set(this._storageKey, this._state);
          break;
        case "history":
          await api.v1.historyStorage.set(this._storageKey, this._state);
          break;
        case "temp":
          await api.v1.tempStorage.set(this._storageKey, this._state);
          break;
        default:
          throw new Error(
            `[SuiBase] setState: unhandled storageMode "${this._storageMode}" for key "${this._storageKey}".`,
          );
      }
    }

    if (applySync) await this.onSync();
  }

  // ── Virtual overridables ──────────────────────────────────

  /**
   * Resolves the theme for the current state. Returns the part map with the state
   * dimension collapsed — i.e. `{ self: { style, ... }, header: { ... }, ... }`.
   *
   * Default implementation returns `this.theme.default` — sufficient for stateless components.
   * Override in stateful components to implement the state machine:
   *
   * @example
   *   resolveTheme(): SuiButtonStateTheme {
   *     return this.state.disabled ? this.theme.disabled : this.theme.default;
   *   }
   */
  resolveTheme(): SuiTheme[string] {
    return this.theme["default"];
  }

  /**
   * Override to push targeted `api.v1.ui.updateParts()` calls when state changes.
   * Fired automatically by `setState()` before external listeners are notified.
   * Do not call `build()` or `open()` here — that triggers a full rebuild and scroll reset.
   */
  onSync(): Promise<void> {
    return Promise.resolve();
  }

  // ── Internal build infrastructure ─────────────────────────

  /**
   * Builds an array of child components into UIParts, calling build() on each.
   * Forwards the current composeContext to each child so context propagates through the tree.
   * Merge order per item (highest specificity wins): base → child's own style → itemFirst/itemLast/itemEven/itemOdd.
   * `base` is a default baseline the child overrides; `itemFirst`/etc. are structural exceptions that always win.
   */
  protected async buildContent(
    children: SuiComposable[],
    childrenStyle?: SuiPositionalPartTheme,
  ): Promise<UIPart[]> {
    const s = childrenStyle ?? {};
    const last = children.length - 1;
    const ctx = this._composeContext;

    // Build all children in parallel — each child's build() is independent.
    const parts = (await Promise.all(
      children.map((child) =>
        child instanceof SuiBase && ctx !== undefined
          ? child._buildWithContext(ctx)
          : child.build(),
      ),
    )) as UIPart[];

    return parts.map((part: UIPart, i: number) => {
      const isFirst = i === 0;
      const isLast = i === last;
      const isEven = i % 2 === 0;
      const isOdd = !isEven;
      const variants: object = {
        ...(isFirst ? s.itemFirst : {}),
        ...(isLast ? s.itemLast : {}),
        ...(isEven ? s.itemEven : {}),
        ...(isOdd ? s.itemOdd : {}),
      };
      const child = children[i];
      if (child instanceof SuiBase) {
        child._baseStyle = s.base ?? {};
        child._variantStyle = variants;
      }
      return {
        ...part,
        style: {
          ...s.base,
          ...(part as { style?: object }).style,
          ...variants,
        },
      } as UIPart;
    });
  }

  /**
   * Hydrates `_state` from storage if `storageMode !== "memory"`.
   * Called internally by `build()` and `open()` before composing content.
   * Public so that owning components can pre-hydrate a child
   * to read its stored state before constructing dependent siblings.
   */
  async hydrateState(): Promise<void> {
    if (this._storageMode === "memory") return;
    let stored: unknown;
    switch (this._storageMode) {
      case "story":
        stored = await api.v1.storyStorage.get(this._storageKey);
        break;
      case "global":
        stored = await api.v1.storage.get(this._storageKey);
        break;
      case "history":
        stored = await api.v1.historyStorage.get(this._storageKey);
        break;
      case "temp":
        stored = await api.v1.tempStorage.get(this._storageKey);
        break;
    }
    if (stored != null) this._state = stored as TState;
  }

  // ── Static utilities ──────────────────────────────────────

  /**
   * Merges one or more partial state theme objects onto a complete base state theme.
   * Used by resolveTheme() to stack active states on top of "default".
   *
   * Merge rules (applied left-to-right for each override):
   *   - "style" property: shallow object merge — individual CSS keys from the override win.
   *   - All other properties: scalar replacement — override value replaces base value when present.
   *   - Absent keys in the override: base value is kept unchanged.
   *
   * @example
   *   resolveTheme() {
   *     const base = this.theme.default;
   *     const over = this.state.disabled ? this.theme.disabled : undefined;
   *     return SuiBase.mergePartTheme(base, over);
   *   }
   */
  static mergePartTheme<TState extends Record<string, Record<string, unknown>>>(
    base: TState,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...overrides: (Record<string, any> | undefined)[]
  ): TState {
    let result = base;
    for (const override of overrides) {
      if (!override) continue;
      const next = { ...result } as Record<string, Record<string, unknown>>;
      for (const partKey of Object.keys(override)) {
        const overridePart = override[partKey] as
          | Record<string, unknown>
          | undefined;
        if (!overridePart) continue;
        const basePart = (result[partKey] ?? {}) as Record<string, unknown>;
        next[partKey] = {
          ...basePart,
          ...overridePart,
          ...("style" in overridePart || "style" in basePart
            ? {
                style: {
                  ...(basePart.style as object | undefined),
                  ...(overridePart.style as object | undefined),
                },
              }
            : {}),
        };
      }
      result = next as TState;
    }
    return result;
  }

  /**
   * Merges a theme override onto a base theme. Fixed 3-level merge: state → part → property.
   * At the property level, scalar values are replaced wholesale.
   * The `style` property is special-cased: it is shallow-merged (individual CSS keys from the
   * override win; absent keys keep their base value). This matches the behaviour of mergePartTheme.
   * Declared `static` so it can be called safely during construction before the instance is fully built.
   */
  protected static mergeTheme<T extends SuiTheme>(
    base: T,
    override: ThemeOverride<T>,
  ): T {
    const result = { ...base };
    for (const state of Object.keys(override) as (keyof T & string)[]) {
      const overrideState = override[state];
      if (!overrideState) continue;
      result[state] = { ...base[state] };
      for (const part of Object.keys(overrideState) as string[]) {
        const overridePart = (overrideState as Record<string, unknown>)[part];
        if (!overridePart) continue;
        const basePart = (base[state]?.[part] ?? {}) as Record<string, unknown>;
        (result[state] as Record<string, unknown>)[part] = {
          ...basePart,
          ...(overridePart as object),
          ...("style" in basePart || "style" in (overridePart as object)
            ? {
                style: {
                  ...(basePart.style as object | undefined),
                  ...((overridePart as Record<string, unknown>).style as
                    | object
                    | undefined),
                },
              }
            : {}),
        };
      }
    }
    return result;
  }

  /**
   * Extracts the positional fields from a `SuiChildrenPartTheme` part into a `SuiPositionalPartTheme`
   * ready to pass to `buildContent()`. Called in `compose()` when constructing the owned wrapper row/column
   * for a list zone.
   */
  protected static listChildrenStyle(
    part: SuiChildrenPartTheme,
  ): SuiPositionalPartTheme {
    return {
      base: part.base,
      itemFirst: part.itemFirst,
      itemLast: part.itemLast,
      itemEven: part.itemEven,
      itemOdd: part.itemOdd,
    };
  }

  // ── Private helpers ───────────────────────────────────────

  /**
   * Read-only access to the current compose context.
   * Only meaningful inside compose() — undefined outside of a build() call.
   */
  protected get composeContext(): SuiComposeContext | undefined {
    return this._composeContext;
  }

  /** @internal Used by SuiComponent.build() to inject context before calling compose(). */
  protected _setComposeContext(ctx: SuiComposeContext | undefined): void {
    this._composeContext = ctx;
  }

  /**
   * Calls build() with a compose context, propagating it through the child tree.
   * Lives on SuiBase so buildContent() can call it without importing SuiComponent.
   * Delegates to the concrete subclass's build(ctx) implementation.
   * @internal
   */
  async _buildWithContext(ctx: SuiComposeContext): Promise<UIPart> {
    this._setComposeContext(ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this as any).build(ctx);
  }
}
