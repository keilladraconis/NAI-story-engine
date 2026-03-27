/**
 * @file SuiCollapsibleSection — wrapper around UIPartCollapsibleSection.
 * Expand/collapse container with a titled header and optional icon.
 *
 * options carries data: children, initialCollapsed.
 * Collapsed state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * All visual properties (title, iconId, style) live in theme.
 *
 * @example
 *   new SuiCollapsibleSection({
 *     id:               "my-section",
 *     children:         [child],
 *     initialCollapsed: false,
 *     state:            { ... },
 *     storageKey:       "sui.my-section",
 *     storageMode:      "memory",
 *     theme:            { ... },
 *   })
 */

import { SuiBase, SuiComponent, type AnySuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/collapsible-section.ts";
import { type SuiCollapsibleSectionStateTheme, type SuiCollapsibleSectionTheme } from "./theme/collapsible-section.ts";

/** options carries data only — all visual properties live in theme. */
export type SuiCollapsibleSectionOptions = {
  children:          AnySuiComponent[];
  initialCollapsed?: boolean;
} & SuiComponentOptions<SuiCollapsibleSectionTheme>;

/**
 * Expand/collapse container. Collapsed state is owned by sui's storage layer.
 * title, iconId, and style are resolved from theme via resolveTheme() on each compose() call.
 * children and initialCollapsed are passed directly from options.
 */
export class SuiCollapsibleSection extends SuiComponent<SuiCollapsibleSectionTheme, Record<string, unknown>, SuiCollapsibleSectionOptions, UIPartCollapsibleSection> {

  constructor(options: SuiCollapsibleSectionOptions) {
    super(options, Theme.collapsibleSection);
  }

  /** Returns the default state theme — SuiCollapsibleSection is stateless. */
  resolveTheme(): SuiCollapsibleSectionStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartCollapsibleSection with caller-supplied data and resolved theme visuals.
   * @returns {UIPartCollapsibleSection}
   */
  async compose(): Promise<UIPartCollapsibleSection> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type:             "collapsibleSection",
      id:               this.id,
      content:          await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.content)),
      initialCollapsed: this.options.initialCollapsed,
      title:            t.self.title ?? "",
      iconId:           t.self.iconId,
      style:            this._composedStyle,
    };
  }
}
