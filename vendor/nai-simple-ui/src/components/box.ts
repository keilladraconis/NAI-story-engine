/**
 * @file SuiBox — wrapper around UIPartBox.
 * Renders children inside the platform's native bordered+background box.
 * For custom-styled wrappers, use SuiContainer instead.
 *
 * options carries only children. style override lives in theme for minor spacing adjustments.
 *
 * @example
 *   new SuiBox({
 *     id:            "my-box",
 *     children:      [child],
 *     state:         { ... },
 *     storageKey:    "sui.my-box",
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
import * as Theme from "./theme/box.ts";
import { type SuiBoxStateTheme, type SuiBoxTheme } from "./theme/box.ts";

/** options carries only children — style override lives in theme. */
export type SuiBoxOptions = {
  children: AnySuiComponent[];
} & SuiComponentOptions<SuiBoxTheme>;

/**
 * Native bordered+background box container.
 * children is passed directly from options as AnySuiComponent[]; compose() is called internally.
 * style override is resolved from theme via resolveTheme() on each compose() call.
 */
export class SuiBox extends SuiComponent<
  SuiBoxTheme,
  Record<string, unknown>,
  SuiBoxOptions,
  UIPartBox
> {
  constructor(options: SuiBoxOptions) {
    super(options, Theme.box);
  }

  /** Returns the default state theme — SuiBox is stateless. */
  resolveTheme(): SuiBoxStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartBox with caller-supplied children and resolved theme style.
   * @returns {UIPartBox}
   */
  async compose(): Promise<UIPartBox> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "box",
      id: this.id,
      content: await this.buildContent(
        this.options.children,
        SuiBase.listChildrenStyle(t.self),
      ),
      style: this._composedStyle,
    };
  }
}
