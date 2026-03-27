/**
 * @file SuiColumn — wrapper around UIPartColumn.
 * Vertical flex container. spacing, alignment, wrap, and style all live in theme.
 *
 * options carries only data: children (pre-composed UIPart[]).
 * All visual and structural properties live in theme.
 *
 * @example
 *   new SuiColumn({
 *     id:            "my-column",
 *     children:      [child],
 *     state:         { ... },
 *     storageKey:    "sui.my-column",
 *     storageMode:   "memory",
 *     theme:         { ... },
 *   })
 */

import { SuiBase, SuiComponent, type AnySuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/column.ts";
import { type SuiColumnStateTheme, type SuiColumnTheme } from "./theme/column.ts";

/** options carries only children — all visual and structural properties live in theme. */
export type SuiColumnOptions = {
  children: AnySuiComponent[];
} & SuiComponentOptions<SuiColumnTheme>;

/**
 * Vertical flex container.
 * Layout (spacing, alignment, wrap) and style are resolved from theme via resolveTheme() on each compose() call.
 * children is passed directly from options as AnySuiComponent[]; compose() is called internally.
 */
export class SuiColumn extends SuiComponent<SuiColumnTheme, Record<string, unknown>, SuiColumnOptions, UIPartColumn> {

  constructor(options: SuiColumnOptions) {
    super(options, Theme.column);
  }

  /** Returns the default state theme — SuiColumn is stateless. */
  resolveTheme(): SuiColumnStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartColumn with resolved theme layout/style and caller-supplied children.
   * @returns {UIPartColumn}
   */
  async compose(): Promise<UIPartColumn> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};

    const content = await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.self));

    return {
      type:      "column",
      id:        this.id,
      content,
      style:     this._composedStyle,
      spacing:   t.self.spacing,
      alignment: t.self.alignment,
      wrap:      t.self.wrap,
    };
  }
}
