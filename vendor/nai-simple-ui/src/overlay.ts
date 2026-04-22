/**
 * @file Abstract base class for all sui overlay components (modals and windows).
 *
 * @description
 * Overlays open a native NAI modal or window — they never produce a UIPart.
 * Every overlay subclasses `SuiOverlay<TTheme, TState, TOptions>`.
 *
 * Lifecycle mirrors SuiComponent:
 *   compose() — abstract, overridden by subclasses to build and return content.
 *   build()   — calls hydrateState() then compose(). Returns the built UIPart[].
 *   open()    — calls build(), opens the overlay, awaits closure, returns TState.
 *   update()  — no arg: full rebuild via build(). partial: pushes scalar field
 *               updates to the open overlay without rebuilding content.
 *   close()   — closes the overlay programmatically.
 *   closed    — Promise that resolves when the overlay is dismissed.
 *
 * Shared infrastructure (id, theme, state, storage, setState,
 * resolveTheme, onSync, mergeTheme, buildContent, ids) lives in SuiBase.
 *
 * @example <caption>Subclass pattern</caption>
 *   class SuiModal extends SuiOverlay<SuiModalTheme, Record<string, never>, SuiModalOptions> {
 *     constructor(options: SuiModalOptions) { super(options, SUI_MODAL_THEME); }
 *     async compose(): Promise<UIPart[]> { return this.buildContent(this.options.content); }
 *     protected openOverlay(content: UIPart[]): Promise<SuiOverlayHandle> { ... }
 *   }
 */

import {
  SuiBase,
  type SuiBaseOptions,
  type SuiTheme,
  type ThemeOverride,
} from "./base.ts"; // ThemeOverride used in constructor signature
import { type AnySuiComponent } from "./component.ts";

/** Handle returned by the native NAI overlay open call. Stored internally after open(). */
export type SuiOverlayHandle = {
  update: (
    options: Partial<ModalOptions> | Partial<WindowOptions>,
  ) => Promise<void>;
  close: () => Promise<void>;
  isClosed: () => boolean;
  closed: Promise<void>;
};

/**
 * Base options type for SuiOverlay subclasses.
 * `children` is the set of child components rendered inside the overlay.
 * Subclasses that override compose() and build their own content may omit this.
 * Per-item positional styles are carried by the theme's `self` part (SuiListTheme).
 */
export type SuiOverlayOptions<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  children?: AnySuiComponent[];
} & SuiBaseOptions<TTheme, TState>;

/** The overlay-specific option fields — everything except base infrastructure. */
export type SuiOverlayPartialOptions<TOptions extends SuiOverlayOptions> =
  Partial<Omit<TOptions, keyof SuiBaseOptions>>;

/**
 * Abstract base for sui overlay components (SuiModal, SuiWindow).
 *
 * @template TTheme   - The overlay's theme type. Structure is always `<state>.<part>.<property>`.
 * @template TState   - The overlay's state type.
 * @template TOptions - Options type extending SuiOverlayOptions.
 */
export abstract class SuiOverlay<
  TTheme extends SuiTheme = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
  TOptions extends SuiOverlayOptions<TTheme, TState> = SuiOverlayOptions<
    TTheme,
    TState
  >,
> extends SuiBase<TTheme, TState, TOptions> {
  // ── Private properties ────────────────────────────────────

  private _handle: SuiOverlayHandle | undefined;

  // ── Constructor ───────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(options: TOptions, baseTheme?: ThemeOverride<TTheme> | TTheme) {
    super(options, baseTheme);
  }

  // ── Public getters ────────────────────────────────────────

  /**
   * Whether the overlay is currently open.
   */
  get isOpen(): boolean {
    return this._handle !== undefined && !this._handle.isClosed();
  }

  /**
   * Promise that resolves when the overlay is closed (by user or programmatically).
   * Returns an already-resolved promise if the overlay has not been opened.
   * Prefer awaiting open() to get the state result on close. Use closed directly
   * only when you need to observe closure without having called open() yourself.
   */
  get closed(): Promise<void> {
    return this._handle?.closed ?? Promise.resolve();
  }

  // ── Public lifecycle methods ──────────────────────────────

  /**
   * Opens the overlay and waits for it to close.
   * Calls build() to get content, opens the overlay, then awaits closure.
   * Returns the overlay's state at the time it closed — useful for overlays that
   * write a result into state before closing (e.g. SuiConfirmModal sets confirmed: true).
   * Callers that don't need the result can simply discard the return value.
   *
   * @returns The overlay's state when it closed.
   */
  async open(): Promise<TState> {
    this._handle = await this.openOverlay(await this.build());
    await this._handle.closed;
    return this.state;
  }

  /**
   * Updates the open overlay.
   * - No argument: full rebuild via build(), pushes new content.
   * - Partial: merges supplied overlay-option-field overrides onto the open overlay
   *   without rebuilding content. Always omits id.
   *   Note: presentational properties (title, size, etc.) live in theme — use
   *   setState() to trigger onSync() instead of passing them here directly.
   * No-op if the overlay is not currently open.
   */
  async update(partial?: SuiOverlayPartialOptions<TOptions>): Promise<void> {
    if (!this._handle) return;
    if (partial !== undefined) {
      await this._handle.update(partial as Partial<ModalOptions>);
    } else {
      await this._handle.update({ content: await this.build() });
    }
  }

  /**
   * Closes the overlay programmatically.
   * No-op if the overlay is not currently open.
   */
  async close(): Promise<void> {
    if (!this._handle) return;
    await this._handle.close();
  }

  // ── Abstract ──────────────────────────────────────────────

  /**
   * Opens the native NAI overlay with the given composed content.
   * Implemented by SuiModal and SuiWindow — each calls their respective api.v1.ui.* method.
   * @returns The overlay handle for subsequent update/close/closed calls.
   */
  protected abstract openOverlay(content: UIPart[]): Promise<SuiOverlayHandle>;

  // ── Internal build infrastructure ─────────────────────────

  /**
   * Hydrates state from storage then calls compose().
   * Called internally by open() and update(). Not overridden by subclasses.
   */
  async build(): Promise<UIPart[]> {
    await this.hydrateState();
    return await this.compose();
  }

  /**
   * Assembles and returns the overlay's content as UIPart[].
   * Called by build() after state is hydrated.
   * Subclasses override this to build their own content.
   * The default implementation builds this.options.children using per-item positional
   * styles derived from the resolved theme's `self` part (SuiListTheme).
   * @internal Do not call directly — use open() or build() instead.
   */
  async compose(): Promise<UIPart[]> {
    const t = this.resolveTheme() as {
      self?: {
        base?: object;
        itemFirst?: object;
        itemLast?: object;
        itemEven?: object;
        itemOdd?: object;
      };
    };
    return this.buildContent(
      this.options.children ?? [],
      t.self ? SuiBase.listChildrenStyle(t.self) : undefined,
    );
  }

  /**
   * Pushes scalar field updates to the live overlay handle without rebuilding content.
   * Called by subclass onSync() implementations after a state change resolves new theme values.
   * No-op if the overlay is not currently open.
   *
   * @example
   *   override async onSync(): Promise<void> {
   *     const t = this.resolveTheme();
   *     await this.updateOverlay({ title: t.self.title });
   *   }
   */
  protected async updateOverlay(
    fields: Partial<ModalOptions> | Partial<WindowOptions>,
  ): Promise<void> {
    if (!this._handle) return;
    await this._handle.update(fields);
  }
}
