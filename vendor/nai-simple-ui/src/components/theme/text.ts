/**
 * @file Theme for SuiText.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiTextPartTheme = {
  text?: string;
  markdown?: boolean;
  noTemplate?: boolean;
  style?: object;
};

export type SuiTextStateTheme = {
  self: SuiTextPartTheme;
};

export type SuiTextTheme = {
  default: SuiTextStateTheme;
};

export const text = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiTextTheme>;
