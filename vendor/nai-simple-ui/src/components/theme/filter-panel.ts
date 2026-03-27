/**
 * @file Theme for SuiFilterPanel.
 * Two-zone layout: search input (top), scrollable list (body).
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiTextInputPartTheme } from "./text-input.ts";

/** Resolved part map for a single SuiFilterPanel state. */
export type SuiFilterPanelStateTheme = {
  self:        SuiChildrenPartTheme;
  searchInput: SuiTextInputPartTheme;
  list:        SuiChildrenPartTheme;
};

/** Theme for SuiFilterPanel. Structure: <state>.<part>.<property>. */
export type SuiFilterPanelTheme = {
  default: SuiFilterPanelStateTheme;
};

/** Default SuiFilterPanel theme. Override via options.theme per-instance. */
export const filterPanel = {
  default: {
    self: {
      style: {
        flex:           "1",
        overflow:       "hidden",
        justifyContent: "flex-start",
        border:         "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius:   "4px",
        minHeight:      "200px",
      },
    },
    searchInput: {
      placeholder: "Search...",
      style: {
        background:   "rgba(0, 0, 0, 0.2)",
        border:       "none",
        borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius: "0",
        margin:       "0",
      },
    },
    list: {
      style: {
        flex:           "1",
        overflow:       "auto",
        justifyContent: "flex-start",
        background:     "rgba(0, 0, 0, 0.1)",
      },
    },
  },
} satisfies ThemeOverride<SuiFilterPanelTheme>;
