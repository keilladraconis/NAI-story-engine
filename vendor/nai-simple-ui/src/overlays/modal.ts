/**
 * @file SuiModal — typed, themeable wrapper around api.v1.ui.modal.open().
 * Extends SuiOverlay. Never produces a UIPart.
 * Call open() to open the modal. Call update() / close() / await closed to manage it.
 *
 * All presentational properties (title, size, hasMinimumHeight, fillWidth) live in theme.
 * State changes trigger onSync(), which pushes updated theme values to the live overlay
 * via the handle without rebuilding content.
 *
 * For simple modals pass children directly:
 *   new SuiModal({ children: [myComponent], theme: { default: { self: { title: "Warning" } } } })
 *
 * For modals with custom build logic, subclass and override compose():
 *   class MyModal extends SuiModal {
 *     async compose(): Promise<UIPart[]> { ... }
 *   }
 *
 * @example
 *   new SuiModal({
 *     id:      "my-modal",
 *     children: [child],
 *     theme: {
 *       default: {
 *         self: {
 *           title:            "My Modal",
 *           size:             "medium",
 *           hasMinimumHeight: false,
 *           fillWidth:        false,
 *         },
 *       },
 *     },
 *   })
 */

import {
  SuiOverlay,
  type SuiOverlayOptions,
  type SuiOverlayHandle,
} from "../overlay.ts";
import { type AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/modal.ts";
import { type SuiModalTheme, type SuiModalStateTheme } from "./theme/modal.ts";

/** options carries data only — all presentational properties live in theme. */
export type SuiModalOptions = {
  children?: AnySuiComponent[];
} & Omit<SuiOverlayOptions<SuiModalTheme, Record<string, never>>, "children">;

/**
 * Typed wrapper around api.v1.ui.modal.open().
 * Stateless — no state machine. All presentational properties (title, size, etc.) live in theme.
 * onSync() pushes updated theme values to the live overlay handle after every setState() call.
 * Override compose() in subclasses to build content dynamically.
 */
export class SuiModal extends SuiOverlay<
  SuiModalTheme,
  Record<string, never>,
  SuiModalOptions
> {
  constructor(options: SuiModalOptions) {
    super(options, Theme.modal);
  }

  /** Returns the resolved part map for the current state. */
  override resolveTheme(): SuiModalStateTheme {
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
      size: t.self.size,
      hasMinimumHeight: t.self.hasMinimumHeight,
      fillWidth: t.self.fillWidth,
    });
  }

  protected override async openOverlay(
    content: UIPart[],
  ): Promise<SuiOverlayHandle> {
    const t = this.resolveTheme();
    return api.v1.ui.modal.open({
      id: this.id,
      title: t.self.title,
      size: t.self.size,
      hasMinimumHeight: t.self.hasMinimumHeight,
      fillWidth: t.self.fillWidth,
      content,
    });
  }
}
