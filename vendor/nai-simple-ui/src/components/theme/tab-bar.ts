/**
 * @file Theme for SuiTabBar.
 */

import { type SuiChildrenPartTheme, type SuiStylePartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiButtonPartTheme } from "./button.ts";

/** Resolved part map for a single SuiTabBar state. */
export type SuiTabBarStateTheme = {
  self:          SuiStylePartTheme;
  tabBar:        SuiStylePartTheme;
  back:          SuiButtonPartTheme;
  tab:           SuiStylePartTheme;
  tabActive:     SuiStylePartTheme;
  tabs:          SuiChildrenPartTheme;
  actions:       SuiChildrenPartTheme;
  content:       SuiChildrenPartTheme;
  pane:          SuiStylePartTheme;
  paneActive:    SuiStylePartTheme;
  overlay:       SuiStylePartTheme;
  overlayActive: SuiStylePartTheme;
};

/** Theme for SuiTabBar. Structure: <state>.<part>.<property>. */
export type SuiTabBarTheme = {
  default: SuiTabBarStateTheme;
};

/** Default SuiTabBar theme — bottom-border active indicator, inactive tabs dimmed. Override via options.theme. */
export const tabBar = {
  default: {
    self: {
      style: {
        flex:           "1",
        justifyContent: "flex-start",
        overflow:       "hidden",
      },
    },
    tabBar: {
      style: {
        justifyContent: "flex-start",
        alignItems:     "stretch",
        gap:            "0",
        border:         "1px solid rgba(255, 255, 255, 0.07)",
        borderRadius:   "4px",
        background:     "rgba(0, 0, 0, 0.2)",
        minHeight:      "36px",
      },
    },
    back: {
      iconId: "arrow-left" as IconId,
      style: {
        padding:    "6px 8px",
        margin:     "0",
        fontSize:   "0.82em",
        fontWeight: "normal",
        background: "none",
        border:     "1px solid transparent",
        opacity:    "0.55",
      },
    },
    tab: {
      style: {
        padding:    "6px 8px",
        margin:     "0",
        fontSize:   "0.82em",
        fontWeight: "normal",
        background: "none",
        border:     "1px solid transparent",
        opacity:    "0.55",
      },
    },
    tabActive: {
      style: {
        fontWeight: "bold",
        background: "rgba(87, 178, 96, 0.25)",
        border:     "1px solid rgb(87, 178, 96)",
        opacity:    "1",
      },
    },
    tabs: {},
    actions: {
      style: {
        flex:           "1",
        justifyContent: "flex-end",
        padding:        "0 4px 0 0",
      },
      base: {
        fontWeight: "normal",
        padding:    "2px 6px",
        margin:     "0",
        border:     "none",
        background: "none",
        opacity:    "0.35",
      },
    },
    content: {
      style: {
        flex:     "1",
        overflow: "auto",
      },
    },
    pane: {
      style: {
        display: "none",
      },
    },
    paneActive: {
      style: {
        flex:           "1",
        overflow:       "hidden",
        justifyContent: "flex-start",
      },
    },
    overlay: {
      style: {
        display: "none",
      },
    },
    overlayActive: {
      style: {
        flex:           "1",
        overflow:       "auto",
        justifyContent: "flex-start",
      },
    },
  },
} satisfies ThemeOverride<SuiTabBarTheme>;
