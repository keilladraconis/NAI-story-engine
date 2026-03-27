/**
 * @file Theme for SuiActionBar.
 * Horizontal row with optional left and right sub-rows.
 * left and right carry both wrapper style and per-item positional overrides
 * (base, itemFirst, itemLast, itemEven, itemOdd).
 */

import { type SuiChildrenPartTheme, type SuiStylePartTheme, type ThemeOverride } from "../../base.ts";

/** Resolved part map for a single SuiActionBar state. */
export type SuiActionBarStateTheme = {
  self:  SuiStylePartTheme;
  left:  SuiChildrenPartTheme;
  right: SuiChildrenPartTheme;
};

/** Theme for SuiActionBar. Structure: <state>.<part>.<property>. */
export type SuiActionBarTheme = {
  default: SuiActionBarStateTheme;
};

/** Default SuiActionBar theme. Override via options.theme per-instance. */
export const actionBar = {
  default: {
    self: {
      style: {
        padding:        "0",
        minHeight:      "32px",
        justifyContent: "flex-start",
        alignItems:     "center",
        gap:            "0",
        border:         "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius:   "4px",
        background:     "rgba(0, 0, 0, 0.2)",
      },
    },
    left: {
      style: {
        padding:        "0",
        gap:            "4px",
        justifyContent: "flex-start",
      },
      base: {
        fontWeight: "normal",
        fontSize:   "0.775rem",
        padding:    "4px 8px",
        margin:     "0",
        gap:        "4px",
      },
    },
    right: {
      style: {
        padding:        "0 3px 0",
        gap:            "4px",
        justifyContent: "flex-end",
        flex:           "1",
      },
      base: {
        fontWeight: "normal",
        fontSize:   "0.775rem",
        padding:    "4px",
        margin:     "0",
        gap:        "4px",
      },
    },
  },
} satisfies ThemeOverride<SuiActionBarTheme>;
