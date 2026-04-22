/**
 * @file SuiWindow — typed, themeable wrapper around api.v1.ui.window.open().
 * Extends SuiOverlay. Never produces a UIPart.
 * Call open() to open the window. Call update() / close() / await closed to manage it.
 *
 * All presentational properties (title, defaultWidth, defaultHeight, etc.) live in theme.
 * State changes trigger onSync(), which pushes updated theme values to the live overlay
 * via the handle without rebuilding content.
 *
 * @example
 *   new SuiWindow({
 *     id:      "my-window",
 *     children: [child],
 *     theme: {
 *       default: {
 *         self: {
 *           title:         "My Window",
 *           defaultWidth:  400,
 *           defaultHeight: 300,
 *           resizable:     true,
 *         },
 *       },
 *     },
 *     state:       {},
 *     storageKey:  "sui.my-window",
 *     storageMode: "memory",
 *   })
 */

import {
  SuiOverlay,
  type SuiOverlayOptions,
  type SuiOverlayHandle,
} from "../overlay.ts";
import { type AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/window.ts";
import {
  type SuiWindowTheme,
  type SuiWindowStateTheme,
} from "./theme/window.ts";

/** options carries data only — all presentational properties live in theme. */
export type SuiWindowOptions = {
  children?: AnySuiComponent[];
} & Omit<SuiOverlayOptions<SuiWindowTheme, Record<string, never>>, "children">;

/**
 * Typed wrapper around api.v1.ui.window.open().
 * Stateless — no state machine. All presentational properties live in theme.
 * onSync() pushes updated theme values to the live overlay handle after every setState() call.
 * Override compose() in subclasses to build content dynamically.
 */
export class SuiWindow extends SuiOverlay<
  SuiWindowTheme,
  Record<string, never>,
  SuiWindowOptions
> {
  constructor(options: SuiWindowOptions) {
    super(options, Theme.window_);
  }

  /** Returns the resolved part map for the current state. */
  override resolveTheme(): SuiWindowStateTheme {
    return this.theme.default;
  }

  /**
   * Pushes updated theme values to the live overlay after a state change.
   * Fired automatically by setState(). Does not rebuild content.
   */
  override async onSync(): Promise<void> {
    const t = this.resolveTheme();
    await this.updateOverlay({
      title: t.self.title,
      defaultWidth: t.self.defaultWidth,
      defaultHeight: t.self.defaultHeight,
      defaultX: t.self.defaultX,
      defaultY: t.self.defaultY,
      minWidth: t.self.minWidth,
      minHeight: t.self.minHeight,
      maxWidth: t.self.maxWidth,
      maxHeight: t.self.maxHeight,
      resizable: t.self.resizable,
    });
  }

  protected override async openOverlay(
    content: UIPart[],
  ): Promise<SuiOverlayHandle> {
    const t = this.resolveTheme();
    return api.v1.ui.window.open({
      id: this.id,
      title: t.self.title,
      defaultWidth: t.self.defaultWidth,
      defaultHeight: t.self.defaultHeight,
      defaultX: t.self.defaultX,
      defaultY: t.self.defaultY,
      minWidth: t.self.minWidth,
      minHeight: t.self.minHeight,
      maxWidth: t.self.maxWidth,
      maxHeight: t.self.maxHeight,
      resizable: t.self.resizable,
      content,
    });
  }
}
