/**
 * @file SuiImage — wrapper around UIPartImage.
 * Displays a base64 data URI image. Only Data URLs are supported — external URLs are blocked by NAI.
 *
 * All visual properties (src, alt, height, width, style) live in theme.
 * src defaults to "" in the base theme — always override it via options.theme.
 *
 * @example
 *   new SuiImage({
 *     id:          "my-image",
 *     state:       { ... },
 *     storageKey:  "sui.my-image",
 *     storageMode: "memory",
 *     theme:       { ... },
 *   })
 */

import { SuiComponent, type SuiComponentOptions } from "../component.ts";
import * as Theme from "./theme/image.ts";
import { type SuiImageStateTheme, type SuiImageTheme } from "./theme/image.ts";

/** options carries no data fields — all visual properties (including src) live in theme. */
export type SuiImageOptions = SuiComponentOptions<SuiImageTheme>;

/**
 * Image display component. Stateless — all visual treatment is theme-driven.
 * src, alt, height, width, and style are all resolved from theme via resolveTheme() on each compose() call.
 */
export class SuiImage extends SuiComponent<
  SuiImageTheme,
  Record<string, unknown>,
  SuiImageOptions,
  UIPartImage
> {
  constructor(options: SuiImageOptions) {
    super(options, Theme.image);
  }

  /** Returns the default state theme — SuiImage is stateless. */
  resolveTheme(): SuiImageStateTheme {
    return this.theme.default;
  }

  /**
   * Returns the UIPartImage with caller-supplied src and resolved theme visuals.
   * @returns {UIPartImage}
   */
  async compose(): Promise<UIPartImage> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "image",
      id: this.id,
      src: t.self.src,
      alt: t.self.alt,
      height: t.self.height,
      width: t.self.width,
      style: this._composedStyle,
    };
  }
}
