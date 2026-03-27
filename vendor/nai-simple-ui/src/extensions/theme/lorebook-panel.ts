/**
 * @file Theme for SuiLorebookPanel.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiLorebookPanelStateTheme = {
  self: {
    style?:     object;
    item?:      object;
    itemFirst?: object;
    itemLast?:  object;
    itemEven?:  object;
    itemOdd?:   object;
  };
};

export type SuiLorebookPanelTheme = {
  default: SuiLorebookPanelStateTheme;
};

export const lorebookPanel = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiLorebookPanelTheme>;
