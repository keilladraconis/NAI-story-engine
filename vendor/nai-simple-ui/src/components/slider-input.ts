/**
 * @file SuiSliderInput — wrapper around UIPartSliderInput.
 * Numeric range slider. Supports a disabled state with independent visual treatment defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange.
 * Input state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (disabled) live in state, not options.
 * All structural and visual properties (min, max, label, step, preventDecimal, uncapMin, uncapMax,
 * prefix, suffix, changeDelay, defaultValue, style) live in theme, per state key.
 * min and max default to 0 and 100 respectively — always override via options.theme.
 *
 * @example
 *   new SuiSliderInput({
 *     id:           "my-slider",
 *     initialValue: 50,
 *     onChange:     (v) => handle(v),
 *     state:        { disabled: false },
 *     storageKey:   "sui.my-slider",
 *     storageMode:  "memory",
 *     theme:        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/slider-input.ts";
import {
  type SuiSliderInputStateTheme,
  type SuiSliderInputTheme,
} from "./theme/slider-input.ts";

/** State shape for SuiSliderInput. disabled drives theme resolution in resolveTheme(). */
export type SuiSliderInputState = {
  disabled?: boolean;
};

/**
 * options carries data and behaviour only — disabled lives in state, all structural and visual properties in theme.
 */
export type SuiSliderInputOptions = {
  initialValue?: number;
  onChange?: (value: number) => void;
} & SuiComponentOptions<SuiSliderInputTheme, SuiSliderInputState>;

/**
 * Numeric range slider with two-state theme (default / disabled).
 * min, max, label, step, preventDecimal, uncapMin, uncapMax, prefix, suffix, changeDelay, defaultValue,
 * and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * initialValue and onChange are passed directly from options.
 */
export class SuiSliderInput extends SuiComponent<
  SuiSliderInputTheme,
  SuiSliderInputState,
  SuiSliderInputOptions,
  UIPartSliderInput
> {
  constructor(options: SuiSliderInputOptions) {
    super(options, Theme.sliderInput);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiSliderInputStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Returns the UIPartSliderInput with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartSliderInput}
   */
  async compose(): Promise<UIPartSliderInput> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "sliderInput",
      id: this.id,
      initialValue: this.options.initialValue,
      onChange: this.options.onChange,
      disabled: this.state.disabled,
      min: t.self.min,
      max: t.self.max,
      label: t.self.label,
      step: t.self.step,
      preventDecimal: t.self.preventDecimal,
      uncapMin: t.self.uncapMin,
      uncapMax: t.self.uncapMax,
      prefix: t.self.prefix,
      suffix: t.self.suffix,
      changeDelay: t.self.changeDelay,
      defaultValue: t.self.defaultValue,
      style: this._composedStyle,
    };
  }
}
