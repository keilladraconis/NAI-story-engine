/**
 * @file SuiButton — wrapper around UIPartButton.
 * Clickable button with optional icon. Supports a disabled state with independent
 * visual treatment (text, iconId, style) defined in theme.
 *
 * options carries data and behaviour: callback, disabledWhileCallbackRunning.
 * State-driving booleans (disabled) live in state, not options.
 * All visual properties (text, iconId, style) live in theme, per state key.
 *
 * @example
 *   new SuiButton({
 *     id:                           "my-button",
 *     callback:                     () => doThing(),  // optional
 *     disabledWhileCallbackRunning: true,
 *     state:                        { disabled: false },
 *     storageKey:                   "sui.my-button",
 *     storageMode:                  "memory",
 *     theme:                        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/button.ts";
import {
  type SuiButtonStateTheme,
  type SuiButtonTheme,
} from "./theme/button.ts";

/** State shape for SuiButton. disabled drives theme resolution in resolveTheme(). */
export type SuiButtonState = {
  disabled?: boolean;
};

/** options carries callback and behaviour flags only — disabled lives in state, visuals in theme. */
export type SuiButtonOptions = {
  callback?: () => void;
  disabledWhileCallbackRunning?: boolean;
} & SuiComponentOptions<SuiButtonTheme, SuiButtonState>;

/**
 * Clickable button with two-state theme (default / disabled).
 * text, iconId, and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * callback is wrapped to fire setState (notifying subscribers) before delegating to options.callback.
 * disabledWhileCallbackRunning is passed directly from options.
 */
export class SuiButton extends SuiComponent<
  SuiButtonTheme,
  SuiButtonState,
  SuiButtonOptions,
  UIPartButton
> {
  constructor(options: SuiButtonOptions) {
    super(options, Theme.button);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiButtonStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /** Fires on button click. Calls setState to notify subscribers. Override in subclasses to add behaviour. */
  protected async onClick(): Promise<void> {
    await this.setState({ ...this.state });
    this.options.callback?.();
  }

  /**
   * Returns the UIPartButton with caller-supplied behaviour and state-resolved theme visuals.
   * @returns {UIPartButton}
   */
  async compose(): Promise<UIPartButton> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "button",
      id: this.id,
      callback: this.onClick.bind(this),
      disabledWhileCallbackRunning: this.options.disabledWhileCallbackRunning,
      disabled: this.state.disabled,
      text: t.self.text,
      iconId: t.self.iconId,
      style: this._composedStyle,
    };
  }
}
