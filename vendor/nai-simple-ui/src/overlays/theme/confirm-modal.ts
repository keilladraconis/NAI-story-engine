/**
 * @file Theme for SuiConfirmModal.
 */

import { type SuiStylePartTheme, type ThemeOverride } from "../../base.ts";
import { type SuiButtonPartTheme } from "../../components/theme/button.ts";
import { type SuiTextPartTheme } from "../../components/theme/text.ts";

/** Resolved part map for a single SuiConfirmModal state. */
export type SuiConfirmModalStateTheme = {
  self: {
    title?: string;
    size?: "full" | "large" | "medium" | "small";
    hasMinimumHeight?: boolean;
    fillWidth?: boolean;
  };
  message: SuiTextPartTheme;
  confirm?: SuiButtonPartTheme;
  cancel?: SuiButtonPartTheme;
  actions?: SuiStylePartTheme;
  body?: SuiStylePartTheme;
};

/** Theme for SuiConfirmModal. Structure: <state>.<part>.<property>. */
export type SuiConfirmModalTheme = {
  default: SuiConfirmModalStateTheme;
};

/** Default SuiConfirmModal theme. Override via options.theme per-instance. */
export const confirmModal = {
  default: {
    self: {
      size: "small",
      hasMinimumHeight: false,
    },
    message: {
      style: {
        padding: "4px 0 12px",
        fontSize: "0.9em",
        lineHeight: "1.5",
      },
    },
    confirm: {
      text: "Confirm",
      iconId: "check" as IconId,
    },
    cancel: {
      text: "Back",
      iconId: "arrow-left" as IconId,
      style: {
        opacity: "0.6",
      },
    },
    actions: {
      style: {
        justifyContent: "flex-end",
        gap: "8px",
        margin: "0 0 18px",
      },
    },
    body: {
      style: {
        display: "flex",
        flexDirection: "column",
      },
    },
  },
} satisfies ThemeOverride<SuiConfirmModalTheme>;
