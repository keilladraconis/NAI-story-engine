/**
 * @file Theme for SuiButton.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiButtonPartTheme = {
  style?:  object;
  text?:   string;
  iconId?: IconId;
};

export type SuiButtonStateTheme = {
  self: SuiButtonPartTheme;
};

export type SuiButtonTheme = {
  default:   SuiButtonStateTheme;
  disabled?: PartialState<SuiButtonStateTheme>;
};

export const button = {
  default: {
    self: {
      style: {},
    },
  },
} satisfies ThemeOverride<SuiButtonTheme>;
