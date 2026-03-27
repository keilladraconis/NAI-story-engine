/**
 * @file Theme for SuiCheckboxInput.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiCheckboxInputPartTheme = {
  label?: string;
  style?: object;
};

export type SuiCheckboxInputStateTheme = {
  self: SuiCheckboxInputPartTheme;
};

export type SuiCheckboxInputTheme = {
  default:   SuiCheckboxInputStateTheme;
  disabled?: PartialState<SuiCheckboxInputStateTheme>;
};

export const checkboxInput = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiCheckboxInputTheme>;
