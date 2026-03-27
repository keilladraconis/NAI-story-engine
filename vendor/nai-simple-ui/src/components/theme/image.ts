/**
 * @file Theme for SuiImage.
 */

import { type ThemeOverride } from "../../base.ts";

export type SuiImagePartTheme = {
  src:     string;
  alt?:    string;
  height?: number;
  width?:  number;
  style?:  object;
};

export type SuiImageStateTheme = {
  self: SuiImagePartTheme;
};

export type SuiImageTheme = {
  default: SuiImageStateTheme;
};

export const image = {
  default: {
    self: {
      src: "",
    },
  },
} satisfies ThemeOverride<SuiImageTheme>;
