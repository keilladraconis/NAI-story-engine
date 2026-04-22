/**
 * @file SuiText — wrapper around UIPartText.
 * Pure display component. All content and rendering properties live in theme.
 *
 * @example
 *   new SuiText({
 *     id:          "my-text",
 *     state:       { ... },
 *     storageKey:  "sui.my-text",
 *     storageMode: "memory",
 *     theme:       { ... },
 *   })
 */

import { SuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/text.ts";
import { type SuiTextStateTheme, type SuiTextTheme } from "./theme/text.ts";

/** options carries no data fields — all display properties live in theme. */
export type SuiTextOptions = SuiComponentOptions<SuiTextTheme>;

/**
 * Static text display component.
 * text, markdown, noTemplate, and style are all resolved from theme via resolveTheme() on each compose() call.
 * Text in `{{curly braces}}` is processed as template storage keys unless `noTemplate` is true in theme.
 * Set `markdown` to true in theme to enable markdown rendering.
 */
export class SuiText extends SuiComponent<
  SuiTextTheme,
  Record<string, unknown>,
  SuiTextOptions,
  UIPartText
> {
  constructor(options: SuiTextOptions) {
    super(options, Theme.text);
  }

  /** Returns the default state theme — SuiText is stateless. */
  resolveTheme(): SuiTextStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartText with all properties resolved from theme.
   * @returns {UIPartText}
   */
  async compose(): Promise<UIPartText> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "text",
      id: this.id,
      text: t.self.text,
      markdown: t.self.markdown,
      noTemplate: t.self.noTemplate,
      style: this._composedStyle,
    };
  }
}
