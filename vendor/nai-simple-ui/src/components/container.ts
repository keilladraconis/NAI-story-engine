/**
 * @file SuiContainer — wrapper around UIPartContainer.
 * Neutral div-like element. No flex layout, no card chrome.
 * Use when box (has chrome) or column (has flex) don't fit.
 *
 * options carries only data: children (pre-composed UIPart[]).
 * All visual properties (style) live in theme.
 *
 * @example
 *   new SuiContainer({
 *     id:            "my-container",
 *     children:      [child],
 *     state:         { ... },
 *     storageKey:    "sui.my-container",
 *     storageMode:   "memory",
 *     theme:         { ... },
 *   })
 */

import { SuiBase, SuiComponent, type AnySuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/container.ts";
import { type SuiContainerStateTheme, type SuiContainerTheme } from "./theme/container.ts";

/** options carries only children — all visual properties live in theme. */
export type SuiContainerOptions = {
  children: AnySuiComponent[];
} & SuiComponentOptions<SuiContainerTheme>;

/**
 * Neutral div-like wrapper with no flex layout or card chrome.
 * style is resolved from theme via resolveTheme() on each compose() call.
 * children is passed directly from options as AnySuiComponent[]; compose() is called internally.
 */
export class SuiContainer extends SuiComponent<SuiContainerTheme, Record<string, unknown>, SuiContainerOptions, UIPartContainer> {

  constructor(options: SuiContainerOptions) {
    super(options, Theme.container);
  }

  /** Returns the default state theme — SuiContainer is stateless. */
  resolveTheme(): SuiContainerStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartContainer with resolved theme style and caller-supplied children.
   * @returns {UIPartContainer}
   */
  async compose(): Promise<UIPartContainer> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type:    "container",
      id:      this.id,
      content: await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.self)),
      style:   this._composedStyle,
    };
  }
}
