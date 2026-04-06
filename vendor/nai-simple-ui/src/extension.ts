/**
 * @file Abstract base class for all sui UIExtension wrappers.
 *
 * @description
 * `SuiExtension` provides the shared infrastructure for wrapping NAI `UIExtension` objects.
 * Each subclass corresponds to one `UIExtension` variant and owns its fields and build logic.
 *
 * Lifecycle:
 *   register() — builds the extension and calls api.v1.ui.register(). No-op if already registered.
 *   update()   — rebuilds (or applies a partial override) and calls api.v1.ui.update(). No-op if not registered.
 *   remove()   — calls api.v1.ui.remove() and clears the init flag. No-op if not registered.
 *
 * `build()` hydrates state then calls `compose()`, which assembles the raw `UIExtension`
 * object. For panel subclasses (scriptPanel, sidebarPanel, lorebookPanel) `compose()`
 * calls `.build()` on each `AnySuiComponent` in `content`.
 *
 * `_isRegistered` tracks registration state and gates all three lifecycle methods.
 *
 * @example
 *   const panel = new SuiSidebarPanel({
 *     id:      "my-panel",
 *     name:    "My Panel",
 *     iconId:  "book" as IconId,
 *     content: [myComponent],
 *   });
 *   await panel.register();
 *   // later:
 *   await panel.update();          // full rebuild
 *   await panel.update({ name: "Renamed" }); // partial — only updates name
 *   await panel.remove();
 */

import {
  SuiBase,
  type SuiBaseOptions,
  type SuiTheme,
  type ThemeOverride,
} from "./base.ts";

// ============================================================
// SuiExtension
// ============================================================

/**
 * Abstract base for all SuiExtension subclasses.
 *
 * @template TType    - The `UIExtension["type"]` literal for this subclass.
 * @template TExt     - The specific `UIExtension` variant this subclass produces.
 * @template TTheme   - The extension's theme type. Structure is always `<state>.<part>.<property>`.
 * @template TState   - The extension's state type.
 * @template TOptions - Options type extending SuiBaseOptions.
 */
export abstract class SuiExtension<
  TType extends UIExtension["type"],
  TExt extends UIExtension & { type: TType },
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends SuiBaseOptions<TTheme, TState> = SuiBaseOptions<
    TTheme,
    TState
  >,
> extends SuiBase<TTheme, TState, TOptions> {
  // ── Private properties ────────────────────────────────────

  private _type: TType;
  private _isRegistered: boolean = false;

  // ── Constructor ───────────────────────────────────────────

  /**
   * @param options    Options including id, storageKey, storageMode.
   * @param type       The UIExtension literal type string (e.g. "sidebarPanel").
   * @param baseTheme  Extension default theme. Merged with options.theme at construction.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    options: TOptions,
    type: TType,
    baseTheme?: ThemeOverride<TTheme> | TTheme,
  ) {
    super(options, baseTheme);
    this._type = type;
  }

  // ── Public getters ────────────────────────────────────────

  /** The UIExtension literal type string (e.g. `"sidebarPanel"`). */
  get type(): TType {
    return this._type;
  }

  /** Whether this extension is currently registered with the UI. */
  get init(): boolean {
    return this._isRegistered;
  }

  // ── Public lifecycle methods ──────────────────────────────

  /**
   * Registers the extension with the UI. No-op if already registered.
   */
  async register(): Promise<void> {
    if (this._isRegistered) return;
    await api.v1.ui.register([await this.build()]);
    this._isRegistered = true;
  }

  /**
   * Updates the registered extension.
   * - With no argument: full rebuild via `build()`.
   * - With a partial: merges the supplied fields on top of the current registered state
   *   without rebuilding content. Always includes `id` automatically.
   * No-op if not registered.
   *
   * @param partial  Optional partial override. Omit to trigger a full rebuild.
   */
  async update(partial?: Partial<Omit<TExt, "type" | "id">>): Promise<void> {
    if (!this._isRegistered) return;
    if (partial !== undefined) {
      await api.v1.ui.update([
        {
          ...partial,
          id: this.id,
          type: this.type,
        } as unknown as Partial<UIExtension> & { id: string },
      ]);
    } else {
      await api.v1.ui.update([
        {
          ...(await this.build()),
          id: this.id,
        } as unknown as Partial<UIExtension> & { id: string },
      ]);
    }
  }

  /**
   * Removes the extension from the UI. No-op if not registered.
   * Resets the init flag so the extension can be re-registered.
   */
  async remove(): Promise<void> {
    if (!this._isRegistered) return;
    await api.v1.ui.remove([this.id]);
    this._isRegistered = false;
  }

  // ── Internal build infrastructure ─────────────────────────

  /**
   * Hydrates state from storage then runs compose().
   * Called internally by `register()` and `update()`. Not overridden by subclasses.
   */
  async build(): Promise<TExt> {
    await this.hydrateState();
    return await this.compose();
  }

  /**
   * Assembles the raw UIExtension object from current options/state.
   * For panel subclasses, builds all content components.
   * Called by `build()` after state is hydrated.
   * @internal Do not call directly. Use register() or update() instead.
   */
  abstract compose(): Promise<TExt>;
}
