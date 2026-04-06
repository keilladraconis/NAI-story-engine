/**
 * @file Theme for SuiCollapsibleSection.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";

/** Display properties for the collapsible section header. */
export type SuiCollapsibleSectionPartTheme = {
  title?: string;
  iconId?: IconId;
  style?: object;
};

export type SuiCollapsibleSectionStateTheme = {
  self: SuiCollapsibleSectionPartTheme;
  content: SuiChildrenPartTheme;
};

export type SuiCollapsibleSectionTheme = {
  default: SuiCollapsibleSectionStateTheme;
};

export const collapsibleSection = {
  default: {
    self: {},
    content: {},
  },
} satisfies ThemeOverride<SuiCollapsibleSectionTheme>;
