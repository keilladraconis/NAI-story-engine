/**
 * @file Theme for SuiMultilineTextInput.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";
import { type SuiTextInputPartTheme } from "./text-input.ts";

export type SuiMultilineTextInputStateTheme = {
  self: SuiTextInputPartTheme;
};

export type SuiMultilineTextInputTheme = {
  default: SuiMultilineTextInputStateTheme;
  disabled?: PartialState<SuiMultilineTextInputStateTheme>;
};

export const multilineTextInput = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiMultilineTextInputTheme>;
