/**
 * @file Theme for SuiCard.
 */

import {
  type PartialState,
  type SuiChildrenPartTheme,
  type SuiStylePartTheme,
  type ThemeOverride,
} from "../../base.ts";
import { type SuiButtonPartTheme } from "./button.ts";

/** Resolved part map for a single SuiCard state. */
export type SuiCardStateTheme = {
  self: SuiStylePartTheme;
  icon: SuiButtonPartTheme;
  body: SuiStylePartTheme;
  title: SuiStylePartTheme;
  label: SuiButtonPartTheme;
  actions: SuiChildrenPartTheme;
  sublabel: SuiButtonPartTheme;
};

/** Theme for SuiCard. Structure: <state>.<part>.<property>. */
export type SuiCardTheme = {
  default: SuiCardStateTheme;
  disabled?: PartialState<SuiCardStateTheme>;
  selected?: PartialState<SuiCardStateTheme>;
};

/** Default SuiCard theme — neutral card layout, label full-width, icon/label dim when disabled. Override via options.theme. */
export const card = {
  default: {
    self: {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "0",
      },
    },
    icon: {
      style: {
        background: "none",
        padding: "8px",
        margin: "0",
        cursor: "default",
        flexShrink: "0",
        alignSelf: "flex-start",
        opacity: "1",
      },
    },
    body: {
      style: {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
      },
    },
    title: {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "0",
      },
    },
    label: {
      style: {
        flex: "1",
        background: "none",
        border: "none",
        padding: "5px 0",
        margin: "0",
        textAlign: "left",
        fontSize: "0.88em",
        cursor: "default",
        opacity: "1",
        fontWeight: "normal",
      },
    },
    actions: {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "0",
        margin: "4px 0",
        padding: "0 4px",
      },
      base: {
        padding: "4px",
        margin: "0",
        background: "none",
        opacity: "0.35",
        fontWeight: "normal",
      },
    },
    sublabel: {
      style: {
        background: "none",
        border: "none",
        padding: "0 0 4px",
        margin: "0",
        textAlign: "left",
        fontSize: "0.64em",
        cursor: "default",
        opacity: "0.35",
        fontWeight: "normal",
        fontStyle: "italic",
      },
    },
  },
  disabled: {
    icon: { style: { opacity: "0.45" } },
    label: { style: { opacity: "0.45" } },
    sublabel: { style: { opacity: "0.25" } },
  },
} satisfies ThemeOverride<SuiCardTheme>;
