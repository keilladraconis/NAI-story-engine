/**
 * @file Theme for SuiBox.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";

export type SuiBoxPartTheme = SuiChildrenPartTheme;

export type SuiBoxStateTheme = {
  self: SuiBoxPartTheme;
};

export type SuiBoxTheme = {
  default: SuiBoxStateTheme;
};

export const box = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiBoxTheme>;
