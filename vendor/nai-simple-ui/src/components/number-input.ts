/**
 * @file SuiNumberInput — wrapper around UIPartNumberInput.
 * Numeric input field. Supports a disabled state with independent visual treatment defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange, onSubmit.
 * Note: onChange and onSubmit receive a string value (the raw input) — this is a NAI API quirk.
 * Input state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (disabled) live in state, not options.
 * All visual properties (label, placeholder, style) live in theme, per state key.
 *
 * @example
 *   new SuiNumberInput({
 *     id:           "my-input",
 *     initialValue: 0,
 *     onChange:     (v) => handle(v),
 *     onSubmit:     (v) => submit(v),
 *     state:        { disabled: false },
 *     storageKey:   "sui.my-input",
 *     storageMode:  "memory",
 *     theme:        { ... },
 *   })
 */

import { SuiBase, SuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/number-input.ts";
import { type SuiNumberInputStateTheme, type SuiNumberInputTheme } from "./theme/number-input.ts";

/** State shape for SuiNumberInput. disabled drives theme resolution in resolveTheme(). */
export type SuiNumberInputState = {
  disabled?: boolean;
};

/**
 * options carries data and behaviour only — disabled lives in state, visuals in theme.
 */
export type SuiNumberInputOptions = {
  initialValue?: number;
  onChange?:     (value: string) => void;
  onSubmit?:     (value: string) => void;
} & SuiComponentOptions<SuiNumberInputTheme, SuiNumberInputState>;

/**
 * Numeric input field with two-state theme (default / disabled).
 * label, placeholder, and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * initialValue, onChange, and onSubmit are passed directly from options.
 */
export class SuiNumberInput extends SuiComponent<SuiNumberInputTheme, SuiNumberInputState, SuiNumberInputOptions, UIPartNumberInput> {

  constructor(options: SuiNumberInputOptions) {
    super(options, Theme.numberInput);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiNumberInputStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Returns the UIPartNumberInput with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartNumberInput}
   */
  async compose(): Promise<UIPartNumberInput> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type:         "numberInput",
      id:           this.id,
      initialValue: this.options.initialValue,
      onChange:     this.options.onChange,
      onSubmit:     this.options.onSubmit,
      disabled:     this.state.disabled,
      label:        t.self.label,
      placeholder:  t.self.placeholder,
      style:        this._composedStyle,
    };
  }
}
