/**
 * @file Theme for SuiTextInput.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiTextInputPartTheme = {
  label?: string;
  placeholder?: string;
  style?: object;
};

export type SuiTextInputStateTheme = {
  self: SuiTextInputPartTheme;
};

export type SuiTextInputTheme = {
  default: SuiTextInputStateTheme;
  disabled?: PartialState<SuiTextInputStateTheme>;
};

export const textInput = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiTextInputTheme>;
