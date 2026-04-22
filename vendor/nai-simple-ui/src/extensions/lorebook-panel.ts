/**
 * @file SuiLorebookPanel — wraps UIExtensionLorebookPanel.
 * Renders a panel in the lorebook when an entry or category is selected.
 * If multiple scripts define this, they appear as tabs within the "Script" tab.
 *
 * Note: UIExtensionLorebookPanel.iconId is typed as `string` (not `IconId`) in the NAI API.
 *
 * @example
 *   const panel = new SuiLorebookPanel({
 *     id:      "my-lorebook-panel",
 *     name:    "My Panel",
 *     children: [myComponent],
 *   });
 *   await panel.register();
 */

import { SuiBase } from "../base.ts";
import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions, SuiTheme } from "../base.ts";
import type { AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/lorebook-panel.ts";
import {
  type SuiLorebookPanelStateTheme,
  type SuiLorebookPanelTheme,
} from "./theme/lorebook-panel.ts";

// ============================================================
// Options
// ============================================================

export type SuiLorebookPanelOptions<
  TTheme extends SuiTheme = SuiLorebookPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Name displayed in the lorebook panel tab list. */
  name: string;
  /**
   * Icon displayed left of the name in the lorebook panel tab list.
   * Typed as `string` to match UIExtensionLorebookPanel — accepts IconId values.
   */
  iconId?: string;
  /** Components to render in the lorebook panel. Built at register/update time. */
  children: AnySuiComponent[];
} & SuiBaseOptions<TTheme, TState>;

// ============================================================
// SuiLorebookPanel
// ============================================================

export class SuiLorebookPanel<
  TTheme extends SuiTheme = SuiLorebookPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends SuiExtension<
  "lorebookPanel",
  UIExtensionLorebookPanel,
  TTheme,
  TState,
  SuiLorebookPanelOptions<TTheme, TState>
> {
  constructor(
    options: SuiLorebookPanelOptions<TTheme, TState>,
    baseTheme = Theme.lorebookPanel as unknown as TTheme,
  ) {
    super(options, "lorebookPanel", baseTheme);
  }

  /** Returns the default state theme — SuiLorebookPanel is stateless. */
  resolveTheme(): SuiLorebookPanelStateTheme {
    return (this.theme as unknown as SuiLorebookPanelTheme).default;
  }

  async compose(): Promise<UIExtensionLorebookPanel> {
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
