/**
 * @file SuiContextMenuButton — wraps UIExtensionContextMenuButton.
 * Renders a button in the editor's context menu.
 * Visual property (text) lives in theme.
 *
 * @example
 *   const btn = new SuiContextMenuButton({
 *     id:       "my-ctx-btn",
 *     callback: ({ selection }) => { ... },
 *     theme: {
 *       default: { self: { text: "Do something" } },
 *     },
 *   });
 *   await btn.register();
 */

import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions } from "../base.ts";
import * as Theme from "./theme/context-menu-button.ts";
import {
  type SuiContextMenuButtonStateTheme,
  type SuiContextMenuButtonTheme,
} from "./theme/context-menu-button.ts";

// ============================================================
// Options
// ============================================================

/** options carries the callback only — text lives in theme. */
export type SuiContextMenuButtonOptions = {
  /** Called when the button is clicked. Receives the user's current selection. */
  callback: (_: { selection: DocumentSelection }) => void;
} & SuiBaseOptions<SuiContextMenuButtonTheme, Record<string, unknown>>;

// ============================================================
// SuiContextMenuButton
// ============================================================

/**
 * Context-menu button. Stateless.
 * text is resolved from theme.default.self.text.
 */
export class SuiContextMenuButton extends SuiExtension<
  "contextMenuButton",
  UIExtensionContextMenuButton,
  SuiContextMenuButtonTheme,
  Record<string, unknown>,
  SuiContextMenuButtonOptions
> {
  constructor(options: SuiContextMenuButtonOptions) {
    super(options, "contextMenuButton", Theme.contextMenuButton);
  }

  /** Returns the default state theme — SuiContextMenuButton is stateless. */
  resolveTheme(): SuiContextMenuButtonStateTheme {
    return this.theme.default;
  }

  async compose(): Promise<UIExtensionContextMenuButton> {
    const t = this.resolveTheme();
    return {
      type: this.type,
      id: this.id,
      text: t.self.text ?? "",
      callback: this.options.callback,
    };
  }
}
