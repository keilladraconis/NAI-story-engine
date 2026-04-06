/**
 * @file SuiConfirmButton — two-tap confirmation button built on UIPartButton.
 * First click transitions to pending state and starts an auto-reset timer.
 * Second click (while pending) cancels the timer and fires onConfirm.
 * Timer expiry resets to default state automatically.
 * Visual snap on state change is pushed via api.v1.ui.updateParts() — no full rebuild.
 *
 * options carries behaviour: onConfirm callback, timeout (ms before auto-reset).
 * State (pending) lives in state. All visual properties (text, iconId, style) live in theme per state key.
 *
 * @example
 *   new SuiConfirmButton({
 *     id:       "my-confirm-btn",
 *     onConfirm: async () => { await doDelete(); },
 *     timeout:   4000,
 *     state:     { pending: false },
 *     storageKey:  "sui.my-confirm-btn",
 *     storageMode: "memory",
 *     theme: {
 *       default: { self: { text: "Delete", iconId: "trash-2", style: {} } },
 *       pending: { self: { text: "Are you sure?", iconId: "alertTriangle", style: {} } },
 *     },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/confirm-button.ts";
import {
  type SuiConfirmButtonStateTheme,
  type SuiConfirmButtonTheme,
} from "./theme/confirm-button.ts";

/** State shape for SuiConfirmButton. pending drives theme resolution and click behaviour. */
export type SuiConfirmButtonState = {
  pending: boolean;
};

/** options carries behaviour only — pending lives in state, visuals in theme. */
export type SuiConfirmButtonOptions = {
  onConfirm: () => Promise<void>;
  timeout?: number;
} & SuiComponentOptions<SuiConfirmButtonTheme, SuiConfirmButtonState>;

/**
 * Two-tap confirmation button. Stateful (pending).
 * First click → pending, starts timer. Second click → onConfirm(), reset. Timer → reset.
 */
export class SuiConfirmButton extends SuiComponent<
  SuiConfirmButtonTheme,
  SuiConfirmButtonState,
  SuiConfirmButtonOptions,
  UIPartButton
> {
  private _timer: number | undefined;

  constructor(options: SuiConfirmButtonOptions) {
    super({ state: { pending: false }, ...options }, Theme.confirmButton);
  }

  /** Merges active state partials onto default. pending stacks on top of default. */
  resolveTheme(): SuiConfirmButtonStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.pending ? this.theme.pending : undefined,
    );
  }

  /**
   * Pushes the current visual state to the live button via updateParts().
   * Fired automatically by setState() on every state change.
   */
  override async onSync(): Promise<void> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    await api.v1.ui.updateParts([
      {
        id: this.id,
        text: t.self.text,
        iconId: t.self.iconId,
        style: this.visibleStyle(this._composedStyle),
      },
    ]);
  }

  private async _onClick(): Promise<void> {
    if (!this.state.pending) {
      await this.setState({ pending: true });
      this._timer = await api.v1.timers.setTimeout(async () => {
        this._timer = undefined;
        await this.setState({ pending: false });
      }, this.options.timeout ?? 4000);
    } else {
      if (this._timer !== undefined) {
        api.v1.timers.clearTimeout(this._timer);
        this._timer = undefined;
      }
      await this.setState({ pending: false });
      await this.options.onConfirm();
    }
  }

  /**
   * Returns the UIPartButton with state-driven visuals and two-tap callback.
   * @returns {UIPartButton}
   */
  async compose(): Promise<UIPartButton> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "button",
      id: this.id,
      callback: this._onClick.bind(this),
      disabledWhileCallbackRunning: true,
      text: t.self.text,
      iconId: t.self.iconId,
      style: this._composedStyle,
    };
  }
}
