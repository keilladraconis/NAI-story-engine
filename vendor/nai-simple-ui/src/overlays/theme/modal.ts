/**
 * @file Theme for SuiModal.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiModalStateTheme = {
  self: {
    style?:            object;
    item?:             object;
    itemFirst?:        object;
    itemLast?:         object;
    itemEven?:         object;
    itemOdd?:          object;
    title?:            string;
    size?:             "full" | "large" | "medium" | "small";
    hasMinimumHeight?: boolean;
    fillWidth?:        boolean;
  };
};

export type SuiModalTheme = {
  default: SuiModalStateTheme;
};

export const modal = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiModalTheme>;
