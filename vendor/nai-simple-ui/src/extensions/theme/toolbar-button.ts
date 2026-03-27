/**
 * @file Theme for SuiToolbarButton.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiToolbarButtonStateTheme = {
  self: {
    text?:   string;
    iconId?: IconId;
  };
};

export type PartialSuiToolbarButtonStateTheme = {
  self?: {
    text?:   string;
    iconId?: IconId;
  };
};

export type SuiToolbarButtonTheme = {
  default:   SuiToolbarButtonStateTheme;
  disabled?: PartialSuiToolbarButtonStateTheme;
};

export const toolbarButton = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiToolbarButtonTheme>;
