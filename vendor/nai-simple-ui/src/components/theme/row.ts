/**
 * @file Theme for SuiRow.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";

export type SuiRowPartTheme = SuiChildrenPartTheme & {
  spacing?:   UIPartRow["spacing"];
  alignment?: UIPartRow["alignment"];
  wrap?:      boolean;
};

export type SuiRowStateTheme = {
  self: SuiRowPartTheme;
};

export type SuiRowTheme = {
  default: SuiRowStateTheme;
};

export const row = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiRowTheme>;
