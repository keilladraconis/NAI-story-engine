/**
 * @file SuiRow — wrapper around UIPartRow.
 * Horizontal flex container. spacing, alignment, wrap, and style all live in theme.
 *
 * options carries only data: children (pre-composed UIPart[]).
 * All visual and structural properties live in theme.
 *
 * @example
 *   new SuiRow({
 *     id:            "my-row",
 *     children:      [child],
 *     state:         { ... },
 *     storageKey:    "sui.my-row",
 *     storageMode:   "memory",
 *     theme:         { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type AnySuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/row.ts";
import { type SuiRowStateTheme, type SuiRowTheme } from "./theme/row.ts";

/** options carries only children — all visual and structural properties live in theme. */
export type SuiRowOptions = {
  children: AnySuiComponent[];
} & SuiComponentOptions<SuiRowTheme>;

/**
 * Horizontal flex container.
 * Layout (spacing, alignment, wrap) and style are resolved from theme via resolveTheme() on each compose() call.
 * children is passed directly from options as AnySuiComponent[]; compose() is called internally.
 */
export class SuiRow extends SuiComponent<
  SuiRowTheme,
  Record<string, unknown>,
  SuiRowOptions,
  UIPartRow
> {
  constructor(options: SuiRowOptions) {
    super(options, Theme.row);
  }

  /** Returns the default state theme — SuiRow is stateless. */
  resolveTheme(): SuiRowStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartRow with resolved theme layout/style and caller-supplied children.
   * @returns {UIPartRow}
   */
  async compose(): Promise<UIPartRow> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "row",
      id: this.id,
      content: await this.buildContent(
        this.options.children,
        SuiBase.listChildrenStyle(t.self),
      ),
      style: this._composedStyle,
      spacing: t.self.spacing,
      alignment: t.self.alignment,
      wrap: t.self.wrap,
    };
  }
}
