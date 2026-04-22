/**
 * @file Theme for SuiColumn.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";

export type SuiColumnPartTheme = SuiChildrenPartTheme & {
  spacing?: UIPartColumn["spacing"];
  alignment?: UIPartColumn["alignment"];
  wrap?: boolean;
};

export type SuiColumnStateTheme = {
  self: SuiColumnPartTheme;
};

export type SuiColumnTheme = {
  default: SuiColumnStateTheme;
};

export const column = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiColumnTheme>;
