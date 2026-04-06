/**
 * @file SuiCheckboxInput — wrapper around UIPartCheckboxInput.
 * Boolean toggle input. Supports a disabled state with independent visual treatment
 * (label, style) defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange.
 * Checkbox state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (disabled) live in state, not options.
 * All visual properties (label, style) live in theme, per state key.
 *
 * @example
 *   new SuiCheckboxInput({
 *     id:           "my-checkbox",
 *     initialValue: false,
 *     storageKey:   "sui.my-checkbox",
 *     storageMode:  "memory",
 *     onChange:     (v) => handle(v),
 *     state:        { disabled: false },
 *     theme:        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/checkbox-input.ts";
import {
  type SuiCheckboxInputStateTheme,
  type SuiCheckboxInputTheme,
} from "./theme/checkbox-input.ts";

/** State shape for SuiCheckboxInput. disabled drives theme resolution in resolveTheme(). */
export type SuiCheckboxInputState = {
  disabled?: boolean;
};

/** options carries data and behaviour only — disabled lives in state, visuals in theme. */
export type SuiCheckboxInputOptions = {
  initialValue?: boolean;
  onChange?: (value: boolean) => void;
} & SuiComponentOptions<SuiCheckboxInputTheme, SuiCheckboxInputState>;

/**
 * Boolean toggle input with two-state theme (default / disabled).
 * label and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * initialValue and onChange are passed directly from options.
 */
export class SuiCheckboxInput extends SuiComponent<
  SuiCheckboxInputTheme,
  SuiCheckboxInputState,
  SuiCheckboxInputOptions,
  UIPartCheckboxInput
> {
  constructor(options: SuiCheckboxInputOptions) {
    super(options, Theme.checkboxInput);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiCheckboxInputStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Returns the UIPartCheckboxInput with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartCheckboxInput}
   */
  async compose(): Promise<UIPartCheckboxInput> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "checkboxInput",
      id: this.id,
      initialValue: this.options.initialValue,
      onChange: this.options.onChange,
      disabled: this.state.disabled,
      label: t.self.label,
      style: this._composedStyle,
    };
  }
}
