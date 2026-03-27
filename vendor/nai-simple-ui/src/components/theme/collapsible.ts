/**
 * @file Theme for SuiCollapsible.
 */

import { type PartialState, type SuiChildrenPartTheme, type SuiStylePartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiButtonPartTheme } from "./button.ts";

/** Resolved part map for a single SuiCollapsible state. */
export type SuiCollapsibleStateTheme = {
  self:            SuiStylePartTheme;
  header:          SuiStylePartTheme;
  headerContent:   SuiStylePartTheme;
  chevron:         SuiButtonPartTheme;
  chevronOpen:     SuiButtonPartTheme;
  chevronDisabled: SuiButtonPartTheme;
  content:         SuiChildrenPartTheme;
  contentVisible:  SuiChildrenPartTheme;
};

/** Theme for SuiCollapsible. Structure: <state>.<part>.<property>. */
export type SuiCollapsibleTheme = {
  default:   SuiCollapsibleStateTheme;
  disabled?: PartialState<SuiCollapsibleStateTheme>;
};

/** Default SuiCollapsible theme. Override via options.theme. */
export const collapsible = {
  default: {
    self: {
      style: {
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
      },
    },
    header: {
      style: {
        alignItems: "center",
        gap:        "0",
      },
    },
    headerContent: {
      style: {
        flex:     "1",
        minWidth: "0",
        padding:  "4px 0",
      },
    },
    chevron: {
      iconId: "chevron-right",
      style: {
        background: "none",
        padding:    "12px 0 12px 4px",
        margin:     "0",
        flexShrink: "0",
        alignSelf:  "flex-start",
        fontSize:   "0.72em",
        opacity:    "0.45",
      },
    },
    chevronOpen: {
      iconId: "chevron-down",
      style: {
        background: "none",
        padding:    "12px 0 12px 4px",
        margin:     "0",
        flexShrink: "0",
        alignSelf:  "flex-start",
        fontSize:   "0.72em",
        opacity:    "0.75",
      },
    },
    chevronDisabled: {
      iconId: "chevron-down",
      style: {
        background: "none",
        padding:    "12px 0 12px 4px",
        margin:     "0",
        flexShrink: "0",
        alignSelf:  "flex-start",
        fontSize:   "0.72em",
        opacity:    "0.25",
      },
    },
    content: {
      style: {
        display: "none",
      },
    },
    contentVisible: {
      style: {
        display:        "flex",
        flexDirection:  "column",
        background:     "rgba(255, 255, 255, 0.02)",
        borderTop:      "1px solid rgba(255, 255, 255, 0.05)",
      },
    },
  },
} satisfies ThemeOverride<SuiCollapsibleTheme>;
