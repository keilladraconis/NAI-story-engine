/**
 * @file SuiScriptPanel — wraps UIExtensionScriptPanel.
 * Renders a panel below the editor that can be opened and closed by the user.
 *
 * @example
 *   const panel = new SuiScriptPanel({
 *     id:      "my-script-panel",
 *     name:    "My Panel",
 *     iconId:  "code" as IconId,
 *     children: [myComponent],
 *   });
 *   await panel.register();
 */

import { SuiBase } from "../base.ts";
import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions, SuiTheme } from "../base.ts";
import type { AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/script-panel.ts";
import {
  type SuiScriptPanelStateTheme,
  type SuiScriptPanelTheme,
} from "./theme/script-panel.ts";

// ============================================================
// Options
// ============================================================

export type SuiScriptPanelOptions<
  TTheme extends SuiTheme = SuiScriptPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Name displayed in the panel list. */
  name: string;
  /** Icon displayed left of the name in the panel list. */
  iconId?: IconId;
  /** Components to render in the panel. Built at register/update time. */
  children: AnySuiComponent[];
} & SuiBaseOptions<TTheme, TState>;

// ============================================================
// SuiScriptPanel
// ============================================================

export class SuiScriptPanel<
  TTheme extends SuiTheme = SuiScriptPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends SuiExtension<
  "scriptPanel",
  UIExtensionScriptPanel,
  TTheme,
  TState,
  SuiScriptPanelOptions<TTheme, TState>
> {
  constructor(
    options: SuiScriptPanelOptions<TTheme, TState>,
    baseTheme = Theme.scriptPanel as unknown as TTheme,
  ) {
    super(options, "scriptPanel", baseTheme);
  }

  /** Returns the default state theme — SuiScriptPanel is stateless. */
  resolveTheme(): SuiScriptPanelStateTheme {
    return (this.theme as unknown as SuiScriptPanelTheme).default;
  }

  async compose(): Promise<UIExtensionScriptPanel> {
    const t = this.resolveTheme();
    const content = await this.buildContent(
      this.options.children,
      SuiBase.listChildrenStyle(t.self),
    );
    return {
      type: this.type,
      id: this.id,
      name: this.options.name,
      iconId: this.options.iconId,
      content,
    };
  }
}
