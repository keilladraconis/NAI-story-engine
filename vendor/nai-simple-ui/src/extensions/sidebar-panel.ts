/**
 * @file SuiSidebarPanel — wraps UIExtensionSidebarPanel.
 * Renders a panel in the infobar (right sidebar). Multiple panels appear as tabs.
 *
 * @example
 *   const panel = new SuiSidebarPanel({
 *     id:      "my-sidebar-panel",
 *     name:    "My Panel",
 *     iconId:  "book" as IconId,
 *     children: [myComponent],
 *   });
 *   await panel.register();
 */

import { SuiBase } from "../base.ts";
import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions, SuiTheme } from "../base.ts";
import type { AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/sidebar-panel.ts";
import { type SuiSidebarPanelStateTheme, type SuiSidebarPanelTheme } from "./theme/sidebar-panel.ts";

// ============================================================
// Options
// ============================================================

export type SuiSidebarPanelOptions<
  TTheme extends SuiTheme                = SuiSidebarPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Name displayed in the sidebar tab list. */
  name:     string;
  /** Icon displayed left of the name in the sidebar tab list. */
  iconId?:  IconId;
  /** Components to render in the sidebar panel. Built at register/update time. */
  children: AnySuiComponent[];
} & SuiBaseOptions<TTheme, TState>;

// ============================================================
// SuiSidebarPanel
// ============================================================

export class SuiSidebarPanel<
  TTheme extends SuiTheme                = SuiSidebarPanelTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends SuiExtension<
  "sidebarPanel",
  UIExtensionSidebarPanel,
  TTheme,
  TState,
  SuiSidebarPanelOptions<TTheme, TState>
> {
  constructor(options: SuiSidebarPanelOptions<TTheme, TState>, baseTheme = Theme.sidebarPanel as unknown as TTheme) {
    super(options, "sidebarPanel", baseTheme);
  }

  /** Returns the default state theme — SuiSidebarPanel is stateless. */
  resolveTheme(): SuiSidebarPanelStateTheme {
    return (this.theme as unknown as SuiSidebarPanelTheme).default;
  }

  async compose(): Promise<UIExtensionSidebarPanel> {
    const t       = this.resolveTheme();
    const content = await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.self));
    return {
      type:   this.type,
      id:     this.id,
      name:   this.options.name,
      iconId: this.options.iconId,
      content,
    };
  }
}
