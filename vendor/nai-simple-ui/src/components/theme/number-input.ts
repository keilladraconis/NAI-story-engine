/**
 * @file Theme for SuiNumberInput.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";
import { type SuiTextInputPartTheme } from "./text-input.ts";

export type SuiNumberInputStateTheme = {
  self: SuiTextInputPartTheme;
};

export type SuiNumberInputTheme = {
  default:   SuiNumberInputStateTheme;
  disabled?: PartialState<SuiNumberInputStateTheme>;
};

export const numberInput = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiNumberInputTheme>;
