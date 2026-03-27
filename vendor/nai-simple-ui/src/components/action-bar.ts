/**
 * @file SuiActionBar — horizontal action row with optional left and right button groups.
 * Standalone composite component. Callers supply left and/or right child sets.
 * Each non-empty group is rendered in its own inner SuiRow.
 *
 * options carries data only — all visual properties live in theme.
 *
 * @example
 *   new SuiActionBar({
 *     id:    "my-panel.actions",
 *     left:  [createBtn],
 *     right: [syncBtn],
 *     theme: {
 *       default: {
 *         left:  { itemFirst: { background: "rgba(87, 178, 96, 0.25)" } },
 *         right: { style: { gap: "8px" } },
 *       },
 *     },
 *   })
 */

import { SuiComponent, type AnySuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/action-bar.ts";
import { type SuiActionBarStateTheme, type SuiActionBarTheme } from "./theme/action-bar.ts";
import { SuiRow } from "./row.ts";

/** options carries data only — all visual properties live in theme. */
export type SuiActionBarOptions = {
  left?:  AnySuiComponent[];
  right?: AnySuiComponent[];
} & SuiComponentOptions<SuiActionBarTheme>;

/**
 * Horizontal action bar. Renders left and right button groups in their own inner rows.
 * Sub-rows are only included when they have items.
 * Stateless — resolveTheme() always returns theme.default.
 */
export class SuiActionBar extends SuiComponent<SuiActionBarTheme, Record<string, unknown>, SuiActionBarOptions, UIPartRow> {

  constructor(options: SuiActionBarOptions) {
    super(options, Theme.actionBar);
  }

  /** Stable IDs for this component's owned children. */
  override get ids(): { self: string; left: string; right: string } {
    return {
      self:  this.id,
      left:  `${this.id}.left`,
      right: `${this.id}.right`,
    };
  }

  /** Stateless — always returns theme.default. */
  resolveTheme(): SuiActionBarStateTheme {
    return this.theme.default;
  }

  /**
   * Builds the outer row containing optional left and right sub-rows.
   * Sub-rows are only emitted when their child list is non-empty.
   * @returns {UIPartRow}
   */
  async compose(): Promise<UIPartRow> {
    const t        = this.resolveTheme();
    const ids      = this.ids;
    const hasLeft  = (this.options.left?.length  ?? 0) > 0;
    const hasRight = (this.options.right?.length ?? 0) > 0;

    const innerChildren: AnySuiComponent[] = [];

    if (hasLeft) {
      innerChildren.push(new SuiRow({
        id:       ids.left,
        children: this.options.left!,
        theme:    { default: { self: t.left } },
      }));
    }

    if (hasRight) {
      innerChildren.push(new SuiRow({
        id:       ids.right,
        children: this.options.right!,
        theme:    { default: { self: t.right } },
      }));
    }

    return await new SuiRow({
      id:       this.id,
      children: innerChildren,
      theme:    { default: { self: t.self } },
    }).build();
  }
}
