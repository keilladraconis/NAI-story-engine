/**
 * @file Theme for SuiSidebarPanel.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiSidebarPanelStateTheme = {
  self: {
    style?:     object;
    item?:      object;
    itemFirst?: object;
    itemLast?:  object;
    itemEven?:  object;
    itemOdd?:   object;
  };
};

export type SuiSidebarPanelTheme = {
  default: SuiSidebarPanelStateTheme;
};

export const sidebarPanel = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiSidebarPanelTheme>;
