/**
 * @file Theme for SuiSectionedList.
 */

import { type SuiChildrenPartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiTextPartTheme } from "./text.ts";

/** Resolved part map for a single SuiSectionedList state. */
export type SuiSectionedListStateTheme = {
  self:     SuiChildrenPartTheme;
  section:  SuiChildrenPartTheme;
  header:   SuiTextPartTheme;
  children: SuiChildrenPartTheme;
};

/** Theme for SuiSectionedList. Structure: <state>.<part>.<property>. */
export type SuiSectionedListTheme = {
  default: SuiSectionedListStateTheme;
};

/** Default SuiSectionedList theme — uppercase small-caps section headers, no background on sections. Override via options.theme. */
export const sectionedList = {
  default: {
    self:     {},
    section:  {},
    header: {
      style: {
        fontSize:      "0.72em",
        fontWeight:    "bold",
        letterSpacing: "0.06em",
        opacity:       "0.65",
        padding:       "12px 6px 0",
        margin:        "0",
        textTransform: "uppercase",
      },
    },
    children: {
      base: {
        borderBottom: "1px solid rgba(255, 255, 255, 0.035)",
      },
      itemLast: {
        borderBottom: "0",
      },
    },
  },
} satisfies ThemeOverride<SuiSectionedListTheme>;
