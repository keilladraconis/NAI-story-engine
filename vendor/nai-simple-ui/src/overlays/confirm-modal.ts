/**
 * @file SuiConfirmModal — a two-button confirmation modal with a title, markdown message,
 * confirm button, and cancel button.
 * Returns state on close — check `confirmed` to know the user's choice.
 * All presentational properties (title, message text, button labels, styles) live in theme.
 *
 * @example
 *   const { confirmed } = await new SuiConfirmModal({
 *     theme: {
 *       default: {
 *         self:    { title: "Delete group?" },
 *         message: { text: "This action cannot be undone.", markdown: true },
 *         confirm: { text: "Delete", style: { background: "#c0392b", color: "#fff" } },
 *       },
 *     },
 *   }).open();
 *   if (confirmed) { ... }
 *
 * @example (dynamic content via mergeTheme)
 *   const { confirmed } = await new SuiConfirmModal({
 *     theme: SuiBase.mergeTheme(myDeleteTheme, {
 *       default: { message: { text: `Delete **"${name}"**?` } },
 *     }),
 *   }).open();
 */

import { SuiBase } from "../base.ts";
import {
  SuiOverlay,
  type SuiOverlayOptions,
  type SuiOverlayHandle,
} from "../overlay.ts";
import { type AnySuiComponent } from "../component.ts";
import { SuiButton } from "../components/button.ts";
import { SuiText } from "../components/text.ts";
import { SuiColumn } from "../components/column.ts";
import { SuiRow } from "../components/row.ts";
import * as Theme from "./theme/confirm-modal.ts";
import {
  type SuiConfirmModalTheme,
  type SuiConfirmModalStateTheme,
} from "./theme/confirm-modal.ts";

/** State for SuiConfirmModal. confirmed is false until the confirm button is pressed. */
export type SuiConfirmModalState = {
  confirmed: boolean;
};

/** Options for SuiConfirmModal. All presentational properties live in theme. */
export type SuiConfirmModalOptions = Omit<
  SuiOverlayOptions<SuiConfirmModalTheme, SuiConfirmModalState>,
  "children"
> & {
  theme?: Partial<SuiConfirmModalTheme>;
};

/**
 * Two-button confirmation modal. Stateful (confirmed).
 * confirmed starts false. Pressing the confirm button sets it to true then closes.
 * Pressing cancel (or the native X) closes without mutating state.
 * Await open() to receive state on close.
 */
export class SuiConfirmModal extends SuiOverlay<
  SuiConfirmModalTheme,
  SuiConfirmModalState,
  SuiConfirmModalOptions
> {
  private _confirmTheme: SuiConfirmModalTheme;

  constructor(options: SuiConfirmModalOptions) {
    const merged = SuiBase.mergeTheme(
      Theme.confirmModal as SuiConfirmModalTheme,
      (options.theme ?? {}) as Partial<SuiConfirmModalTheme>,
    );
    super(
      { ...options, state: { confirmed: false, ...options.state } },
      merged,
    );
    this._confirmTheme = merged;
  }

  /** Returns the resolved part map for the current state. */
  override resolveTheme(): SuiConfirmModalStateTheme {
    return this._confirmTheme.default;
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

  /**
   * Builds the modal body: a markdown message and a row of cancel + confirm buttons.
   * @returns {UIPart[]}
   */
  override async compose(): Promise<UIPart[]> {
    const id = this.id;
    const t = this.resolveTheme();

    const messageText = new SuiText({
      id: `${id}.message`,
      theme: {
        default: {
          self: { ...t.message, markdown: t.message.markdown ?? true },
        },
      },
    });

    const cancelBtn = new SuiButton({
      id: `${id}.cancel`,
      callback: async () => {
        await this.close();
      },
      theme: { default: { self: t.cancel } },
    });

    const confirmBtn = new SuiButton({
      id: `${id}.confirm`,
      callback: async () => {
        await this.setState({ confirmed: true });
        await this.close();
      },
      theme: { default: { self: t.confirm } },
    });

    const actionsRow = new SuiRow({
      id: `${id}.actions`,
      children: [cancelBtn, confirmBtn] as AnySuiComponent[],
      theme: { default: { self: t.actions ?? {} } },
    });

    return this.buildContent([
      new SuiColumn({
        id: `${id}.body`,
        children: [messageText, actionsRow] as AnySuiComponent[],
        theme: { default: { self: t.body ?? {} } },
      }),
    ]);
  }
}
