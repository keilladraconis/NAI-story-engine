/**
 * ClickGuard — leading-edge debounce for UI button callbacks.
 *
 * The NovelAI UI can deliver a single tap as two callback invocations, and an
 * impatient double-click on a Generate button used to queue two identical
 * generations (doubling lorebook text and burning output budget). Guarded
 * callbacks run on the first click and swallow repeats inside the window, so
 * the button still feels instant.
 *
 * Guards are keyed by action name, so a mode-changing button (Generate →
 * Cancel) doesn't swallow the follow-up click that targets a different action.
 *
 * One guard per component instance — never share one across components, and
 * never hold one in module scope (see the no-singletons rule in CLAUDE.md).
 *
 * @example
 *   private readonly _clicks = new ClickGuard();
 *   ...
 *   button({ id: "save", callback: this._clicks.wrap("save", () => this._save()) })
 */

/** Window in which a repeated click on the same action is treated as a bounce. */
export const CLICK_GUARD_MS = 500;

export class ClickGuard {
  private readonly _windowMs: number;
  private readonly _lastAt: Record<string, number>;

  constructor(windowMs: number = CLICK_GUARD_MS) {
    this._windowMs = windowMs;
    this._lastAt = {};
  }

  /**
   * True when this click should be handled; false when it lands inside the
   * bounce window of the previous click on the same action.
   */
  accepts(action: string): boolean {
    const now = Date.now();
    if (now - (this._lastAt[action] ?? 0) < this._windowMs) return false;
    this._lastAt[action] = now;
    return true;
  }

  /** Wrap a callback so repeat clicks inside the window are dropped. */
  wrap(action: string, fn: () => void): () => void {
    return () => {
      if (!this.accepts(action)) return;
      fn();
    };
  }
}
