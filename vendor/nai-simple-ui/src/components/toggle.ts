/**
 * @file SuiToggle — stateful on/off toggle built on UIPartButton.
 * Renders as a button. Manages its own on/off state — flipping state.on on each click.
 * Supports three theme states: default (off), on, and disabled.
 *
 * options carries behaviour: callback (fired after state flip), disabledWhileCallbackRunning.
 * State-driving booleans (on, disabled) live in state, not options.
 * All visual properties (text, iconId, style) live in theme, per state key.
 *
 * @example
 *   new SuiToggle({
 *     id:                           "my-toggle",
 *     callback:                     () => doThing(),
 *     disabledWhileCallbackRunning: true,
 *     state:                        { on: false, disabled: false },
 *     storageKey:                   "sui.my-toggle",
 *     storageMode:                  "memory",
 *     theme:                        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/toggle.ts";
import {
  type SuiToggleStateTheme,
  type SuiToggleTheme,
} from "./theme/toggle.ts";

/** State shape for SuiToggle. on and disabled drive theme resolution in resolveTheme(). */
export type SuiToggleState = {
  on: boolean;
  disabled?: boolean;
};

/** options carries callback and behaviour flags only — on and disabled live in state, visuals in theme. */
export type SuiToggleOptions = {
  callback?: () => void;
  disabledWhileCallbackRunning?: boolean;
} & SuiComponentOptions<SuiToggleTheme, SuiToggleState>;

/**
 * Stateful on/off toggle with three-state theme (default / on / disabled).
 * Flips state.on on each click, then fires options.callback if supplied.
 * text, iconId, and style are resolved from theme via resolveTheme() based on this.state.
 */
export class SuiToggle extends SuiComponent<
  SuiToggleTheme,
  SuiToggleState,
  SuiToggleOptions,
  UIPartButton
> {
  constructor(options: SuiToggleOptions) {
    super(options, Theme.toggle);
  }

  /** Merges active state partials onto default. on stacks first, disabled stacks on top. */
  resolveTheme(): SuiToggleStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.on ? this.theme.on : undefined,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /** Pushes current icon and style to the live button via updateParts(). Fired automatically by setState(). */
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

  /** Flips state.on then fires options.callback. */
  async onClick(): Promise<void> {
    await this.setState({ ...this.state, on: !this.state.on });
    this.options.callback?.();
  }

  /**
   * Returns the UIPartButton with state-flipping callback and state-resolved theme visuals.
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
