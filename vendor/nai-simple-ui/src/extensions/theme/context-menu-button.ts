/**
 * @file Theme for SuiContextMenuButton.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiContextMenuButtonStateTheme = {
  self: {
    style?: object;
    text?:  string;
  };
};

export type SuiContextMenuButtonTheme = {
  default: SuiContextMenuButtonStateTheme;
};

export const contextMenuButton = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiContextMenuButtonTheme>;
