/**
 * @file Theme for SuiToolboxOption.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiToolboxOptionStateTheme = {
  self: {
    style?: object;
    item?: object;
    itemFirst?: object;
    itemLast?: object;
    itemEven?: object;
    itemOdd?: object;
  };
};

export type SuiToolboxOptionTheme = {
  default: SuiToolboxOptionStateTheme;
};

export const toolboxOption = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiToolboxOptionTheme>;
