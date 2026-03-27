/**
 * @file Theme for SuiSliderInput.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiSliderInputPartTheme = {
  min:              number;
  max:              number;
  label?:           string;
  step?:            number;
  preventDecimal?:  boolean;
  uncapMin?:        boolean;
  uncapMax?:        boolean;
  prefix?:          string;
  suffix?:          string;
  changeDelay?:     number;
  defaultValue?:    number;
  style?:           object;
};

export type SuiSliderInputStateTheme = {
  self: SuiSliderInputPartTheme;
};

export type SuiSliderInputTheme = {
  default:   SuiSliderInputStateTheme;
  disabled?: PartialState<SuiSliderInputStateTheme>;
};

export const sliderInput = {
  default: {
    self: {
      min: 0,
      max: 100,
    },
  },
} satisfies ThemeOverride<SuiSliderInputTheme>;
