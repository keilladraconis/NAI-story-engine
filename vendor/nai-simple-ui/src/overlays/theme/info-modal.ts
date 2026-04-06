/**
 * @file Theme for SuiInfoModal.
 */

import { type SuiStylePartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiButtonPartTheme } from "../../components/theme/button.ts";
import { type SuiTextPartTheme } from "../../components/theme/text.ts";

/** Resolved part map for a single SuiInfoModal state. */
export type SuiInfoModalStateTheme = {
  self: {
    title?: string;
    size?: "full" | "large" | "medium" | "small";
    hasMinimumHeight?: boolean;
    fillWidth?: boolean;
  };
  message: SuiTextPartTheme;
  dismiss: SuiButtonPartTheme;
  body?: SuiStylePartTheme;
};

/** Theme for SuiInfoModal. Structure: <state>.<part>.<property>. */
export type SuiInfoModalTheme = {
  default: SuiInfoModalStateTheme;
};

/** Default SuiInfoModal theme. Override via options.theme per-instance. */
export const infoModal = {
  default: {
    self: {
      size: "small",
    },
    message: {
      style: {
        padding: "4px 0 12px",
        fontSize: "0.9em",
        lineHeight: "1.5",
      },
    },
    dismiss: {
      text: "OK",
      style: {
        margin: "0 0 20px",
        display: "block",
      },
    },
    body: {
      style: {
        display: "flex",
        flexDirection: "column",
      },
    },
  },
} satisfies ThemeOverride<SuiInfoModalTheme>;
