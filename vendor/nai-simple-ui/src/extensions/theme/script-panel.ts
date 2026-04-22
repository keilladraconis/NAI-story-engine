/**
 * @file Theme for SuiScriptPanel.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiScriptPanelStateTheme = {
  self: {
    style?: object;
    item?: object;
    itemFirst?: object;
    itemLast?: object;
    itemEven?: object;
    itemOdd?: object;
  };
};

export type SuiScriptPanelTheme = {
  default: SuiScriptPanelStateTheme;
};

export const scriptPanel = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiScriptPanelTheme>;
