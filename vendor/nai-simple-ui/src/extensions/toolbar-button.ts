/**
 * @file SuiToolbarButton — wraps UIExtensionToolbarButton.
 * Renders a button in the toolbar above the editor controls.
 * Visual properties (text, iconId, style) live in theme. Stateful (disabled).
 *
 * @example
 *   const btn = new SuiToolbarButton({
 *     id:                           "my-toolbar-btn",
 *     callback:                     () => { ... },
 *     disabledWhileCallbackRunning: true,
 *     theme: {
 *       default: { self: { text: "Run", iconId: "play" as IconId, style: {} } },
 *       disabled: { self: { text: "Run" } },
 *     },
 *   });
 *   await btn.register();
 */

import { SuiBase } from "../base.ts";
import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions } from "../base.ts";
import * as Theme from "./theme/toolbar-button.ts";
import { type SuiToolbarButtonStateTheme, type SuiToolbarButtonTheme } from "./theme/toolbar-button.ts";

// ============================================================
// State
// ============================================================

/** State shape for SuiToolbarButton. disabled drives theme resolution in resolveTheme(). */
export type SuiToolbarButtonState = {
  disabled?: boolean;
};

// ============================================================
// Options
// ============================================================

/** options carries behaviour flags and callback only — disabled lives in state, visuals in theme. */
export type SuiToolbarButtonOptions = {
  /** Whether the button should be disabled while the callback is running. */
  disabledWhileCallbackRunning?: boolean;
  /** Called when the button is clicked. */
  callback?:                     () => void;
} & SuiBaseOptions<SuiToolbarButtonTheme, SuiToolbarButtonState>;

// ============================================================
// SuiToolbarButton
// ============================================================

/**
 * Toolbar button with two-state theme (default / disabled).
 * text, iconId, and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * Visual snap on state change is pushed via api.v1.ui.updateParts() in onSync().
 */
export class SuiToolbarButton extends SuiExtension<
  "toolbarButton",
  UIExtensionToolbarButton,
  SuiToolbarButtonTheme,
  SuiToolbarButtonState,
  SuiToolbarButtonOptions
> {
  constructor(options: SuiToolbarButtonOptions) {
    super(options, "toolbarButton", Theme.toolbarButton);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiToolbarButtonStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Pushes the current visual state to the live button via updateParts().
   * Fired automatically by setState() on every state change.
   */
  override async onSync(): Promise<void> {
    const t = this.resolveTheme();
    await api.v1.ui.updateParts([{
      id:     this.id,
      text:   t.self.text,
      iconId: t.self.iconId,
    }]);
  }

  async compose(): Promise<UIExtensionToolbarButton> {
    const t = this.resolveTheme();
    return {
      type:                         this.type,
      id:                           this.id,
      text:                         t.self.text,
      iconId:                       t.self.iconId,
      disabled:                     this.state.disabled,
      disabledWhileCallbackRunning: this.options.disabledWhileCallbackRunning,
      callback:                     this.options.callback,
    };
  }
}
