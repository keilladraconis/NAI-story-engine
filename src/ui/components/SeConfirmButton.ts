/**
 * SeConfirmButton — Story Engine flavored SuiConfirmButton.
 *
 * Provides sensible Story Engine defaults (4s timeout, warning color on pending).
 * Caller sets text/iconId/style via theme options.
 *
 * Usage:
 *   new SeConfirmButton({
 *     id:        "my-delete-btn",
 *     label:     "Delete",
 *     iconId:    "trash-2",
 *     onConfirm: async () => { ... },
 *   })
 */

import { SuiConfirmButton, type SuiConfirmButtonOptions } from "nai-simple-ui";
import { colors } from "../theme";

export type SeConfirmButtonOptions = {
  /** Button label in default state. */
  label: string;
  iconId?: IconId;
  /** Label shown in pending (confirm?) state. Defaults to "Confirm?". */
  confirmLabel?: string;
  style?: object;
  onConfirm: () => Promise<void>;
  timeout?: number;
  id?: string;
};

/** Thin Story Engine wrapper around SuiConfirmButton. */
export class SeConfirmButton extends SuiConfirmButton {
  constructor(options: SeConfirmButtonOptions) {
    const suiOptions: SuiConfirmButtonOptions = {
      id: options.id,
      onConfirm: options.onConfirm,
      timeout: options.timeout ?? 4000,
      state: { pending: false },
      theme: {
        default: {
          self: {
            text: options.label,
            iconId: options.iconId,
            style: options.style ?? {},
          },
        },
        pending: {
          self: {
            text: options.confirmLabel ?? "Confirm?",
            iconId: "alertTriangle" as IconId,
            style: {
              color: colors.warning,
              "font-weight": "bold",
              ...(options.style ?? {}),
            },
          },
        },
      },
    };
    super(suiOptions);
  }
}
