/**
 * @file Theme for SuiWindow.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiWindowStateTheme = {
  self: {
    style?: object;
    item?: object;
    itemFirst?: object;
    itemLast?: object;
    itemEven?: object;
    itemOdd?: object;
    title?: string;
    defaultWidth?: number | string;
    defaultHeight?: number | string;
    defaultX?: number | string;
    defaultY?: number | string;
    minWidth?: number | string;
    minHeight?: number | string;
    maxWidth?: number | string;
    maxHeight?: number | string;
    resizable?: boolean;
  };
};

export type SuiWindowTheme = {
  default: SuiWindowStateTheme;
};

export const window_ = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiWindowTheme>;
