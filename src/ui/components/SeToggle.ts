/**
 * SeToggle — SuiToggle with a click cooldown for touch interfaces.
 *
 * Touch surfaces deliver a synthesized click alongside the touch event, so a
 * single tap can reach `onClick` twice. SuiToggle flips `state.on` on every
 * click, so a doubled tap flips the toggle to its new value and straight back —
 * the toggle looks unresponsive and any dispatch in `callback` runs twice.
 *
 * The guard is set synchronously before the (async) state flip, so a second
 * click arriving while the first is still in flight is dropped too.
 */

import { SuiToggle, type SuiToggleOptions } from "nai-simple-ui";

/**
 * Clicks landing within this many ms of an accepted click are ignored.
 * Sized to cover the ~300ms touch→click delay that produces ghost clicks,
 * while staying short enough that a deliberate re-toggle still registers.
 */
export const TOGGLE_CLICK_COOLDOWN_MS = 400;

export class SeToggle extends SuiToggle {
  private _lastClickAt = Number.NEGATIVE_INFINITY;

  constructor(options: SuiToggleOptions) {
    super(options);
  }

  /** Drops repeat clicks inside the cooldown window, otherwise flips as usual. */
  override async onClick(): Promise<void> {
    const now = Date.now();
    if (now - this._lastClickAt < TOGGLE_CLICK_COOLDOWN_MS) return;
    this._lastClickAt = now;
    await super.onClick();
  }
}
