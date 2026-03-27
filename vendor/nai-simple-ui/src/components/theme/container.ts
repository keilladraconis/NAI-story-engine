/**
 * @file Theme for SuiContainer.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";

export type SuiContainerPartTheme = SuiChildrenPartTheme;

export type SuiContainerStateTheme = {
  self: SuiContainerPartTheme;
};

export type SuiContainerTheme = {
  default: SuiContainerStateTheme;
};

export const container = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiContainerTheme>;
