/**
 * @file Abstract base class for all sui plugin orchestrators.
 *
 * @description
 * `SuiPlugin` is the top-level orchestrator for a NAI script plugin. Subclass it once
 * per plugin and override the abstract methods to define permissions, extensions, and hooks.
 *
 * Lifecycle (all managed by `start()`):
 *   1. requestPermissions() — sync, before any await
 *   2. _checkMeta()         — version check; calls onVersionChange() if version changed
 *   3. build()              — hydrateState() then compose()
 *   4. registerHooks()      — subclass registers all api.v1.hooks callbacks
 *
 * Global state, storage, and theming are available via the inherited SuiBase API
 * (this.state, this.setState(), this.theme, this.storageKey, etc.).
 *
 * The subclass saves extension references to private fields in compose() for use in
 * registerHooks() callbacks. SuiPlugin never holds or manages extension references.
 *
 * @example
 *   class MyPlugin extends SuiPlugin {
 *     private _panel?: SuiSidebarPanel;
 *
 *     protected override get metaKey() { return "my-plugin.meta"; }
 *
 *     protected requestPermissions(): void {
 *       api.v1.permissions.request(["lorebookEdit"]);
 *     }
 *
 *     protected override async onVersionChange(isFirstLoad: boolean): Promise<void> {
 *       if (!isFirstLoad) await api.v1.ui.toast(`Updated to v${api.v1.script.version}.`);
 *     }
 *
 *     protected async compose(): Promise<void> {
  *       this._panel = new SuiSidebarPanel({ id: "my-panel", name: "My Plugin", children: [...] });
 *       await this._panel.register();
 *     }
 *
 *     protected async registerHooks(): Promise<void> {
 *       api.v1.hooks.register("onGenerationRequested", async () => { ... });
 *     }
 *   }
 *
 *   // src/index.ts:
 *   new MyPlugin({ id: "my-plugin" }).start();
 */

import { SuiBase, type SuiBaseOptions, type SuiTheme } from "./base.ts";

// ============================================================
// Options
// ============================================================

/**
 * Options for SuiPlugin subclasses. All behaviour is expressed through method overrides —
 * options carry only the SuiBase infrastructure (id, theme, state, storageKey, storageMode).
 */
export type SuiPluginOptions<
  TTheme extends SuiTheme                = SuiTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = SuiBaseOptions<TTheme, TState>;

// ============================================================
// SuiPlugin
// ============================================================

/**
 * Abstract orchestrator base for NAI script plugins.
 *
 * @template TTheme   - Plugin-wide theme type. Used for global theming / theme switching.
 * @template TState   - Plugin-wide state type. Persisted via storageKey / storageMode.
 * @template TOptions - Options type extending SuiPluginOptions.
 */
export abstract class SuiPlugin<
  TTheme   extends SuiTheme                            = SuiTheme,
  TState   extends Record<string, unknown>             = Record<string, unknown>,
  TOptions extends SuiPluginOptions<TTheme, TState>    = SuiPluginOptions<TTheme, TState>,
> extends SuiBase<TTheme, TState, TOptions> {

  // ── Virtual ───────────────────────────────────────────────

  /**
   * Storage key for the plugin meta record (version tracking).
   * Defaults to `${this.id}.meta`. Override to use a custom key.
   * Return `undefined` to skip version tracking entirely.
   */
  protected get metaKey(): string | undefined {
    return `${this.id}.meta`;
  }

  /**
   * Called when `api.v1.script.version` differs from the stored version.
   * `isFirstLoad` is true when no version record existed yet.
   * Base implementation is a no-op. Override to show toasts, run migrations, etc.
   */
  protected async onVersionChange(_isFirstLoad: boolean): Promise<void> {
    // no-op — override in subclass
  }

  // ── Abstract ──────────────────────────────────────────────

  /**
   * Request all permissions this plugin requires.
   * Called synchronously as the very first operation in start(), before any await.
   * Body is typically a single `api.v1.permissions.request([...])` call.
   */
  protected abstract requestPermissions(): void;

  /**
   * Construct and register all SuiExtension instances for this plugin.
   * Called by build() after state is hydrated.
   * Save extension references to private fields for use in registerHooks().
   */
  protected abstract compose(): Promise<void>;

  /**
   * Register all api.v1.hooks callbacks for this plugin.
   * Called during start() after build(). Extension references saved in compose() are
   * available here for use inside hook callbacks.
   */
  protected abstract registerHooks(): Promise<void>;

  // ── Concrete ──────────────────────────────────────────────

  /**
   * Starts the plugin. Orchestrates the full initialization sequence:
   *   1. requestPermissions() — sync, before any await
   *   2. Version meta check   — calls onVersionChange() if version changed
   *   3. build()              — hydrateState() + compose() (construct + register all extensions)
   *   4. registerHooks()      — register all hook callbacks
   */
  async start(): Promise<void> {
    this.requestPermissions();
    try {
      api.v1.log(`${api.v1.script.name}: initializing...`);
      await this._checkMeta();
      await this.build();
      await this.registerHooks();
      api.v1.log(`${api.v1.script.name}: ready.`);
    } catch (err) {
      api.v1.log(`${api.v1.script.name}: startup error:`, err);
    }
  }

  /**
   * Hydrates state from storage then calls compose().
   * Called internally by start(). Not overridden by subclasses.
   */
  async build(): Promise<void> {
    await this.hydrateState();
    await this.compose();
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Reads the stored version from story storage and compares it to the current script version.
   * If they differ, calls onVersionChange(isFirstLoad) and writes the new version back.
   * Skipped entirely if metaKey returns undefined.
   */
  private async _checkMeta(): Promise<void> {
    const key = this.metaKey;
    if (!key) return;

    const stored      = await api.v1.storyStorage.get(key) as { version?: string } | undefined;
    const isFirstLoad = stored === undefined;

    if (stored?.version !== api.v1.script.version) {
      await this.onVersionChange(isFirstLoad);
      await api.v1.storyStorage.set(key, { version: api.v1.script.version });
    }
  }
}
