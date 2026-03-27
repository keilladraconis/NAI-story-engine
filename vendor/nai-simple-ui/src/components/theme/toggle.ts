/**
 * @file Theme for SuiToggle.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiTogglePartTheme = {
  style?:  object;
  text?:   string;
  iconId?: IconId;
};

export type SuiToggleStateTheme = {
  self: SuiTogglePartTheme;
};

export type SuiToggleTheme = {
  default:   SuiToggleStateTheme;
  on?:       PartialState<SuiToggleStateTheme>;
  disabled?: PartialState<SuiToggleStateTheme>;
};

export const toggle = {
  default: {
    self: {
      iconId: "toggle-left",
      style: {
        background: "none",
        opacity:    "0.45",
      },
    },
  },
  on: {
    self: {
      iconId: "toggle-right",
      style: {
        color:   "rgb(87, 178, 96)",
        opacity: "1",
      },
    },
  },
  disabled: {
    self: {
      style: {
        opacity: "0.25",
      },
    },
  },
} satisfies ThemeOverride<SuiToggleTheme>;
