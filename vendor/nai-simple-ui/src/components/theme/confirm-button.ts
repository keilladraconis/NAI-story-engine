/**
 * @file Theme for SuiConfirmButton.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";
import { type SuiButtonPartTheme } from "./button.ts";

export type SuiConfirmButtonStateTheme = {
  self: SuiButtonPartTheme;
};

export type SuiConfirmButtonTheme = {
  default: SuiConfirmButtonStateTheme;
  pending?: PartialState<SuiConfirmButtonStateTheme>;
};

export const confirmButton = {
  default: {
    self: {
      style: {},
    },
  },
} satisfies ThemeOverride<SuiConfirmButtonTheme>;
