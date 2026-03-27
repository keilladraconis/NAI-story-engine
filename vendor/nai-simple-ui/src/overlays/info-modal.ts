/**
 * @file SuiInfoModal — a simple informational modal with a title, markdown message, and dismiss button.
 * Subclasses SuiModal. Content is fully owned — no children option.
 * All presentational properties (title, message text, dismiss label, size, styles) live in theme.
 * The dismiss button is shown when theme.default.dismiss.text is non-empty; omit or clear it to suppress.
 *
 * @example
 *   await new SuiInfoModal({
 *     theme: {
 *       default: {
 *         self:    { title: "No Trigger Configured" },
 *         message: { text: "**Entry** has no keys and is not Always On.", markdown: true },
 *       },
 *     },
 *   }).open();
 *
 * @example (dynamic content via mergeTheme)
 *   await new SuiInfoModal({
 *     theme: SuiBase.mergeTheme(myStaticTheme, {
 *       default: { message: { text: `**"${name}"** something dynamic.` } },
 *     }),
 *   }).open();
 */

import { SuiBase } from "../base.ts";
import { SuiModal, type SuiModalOptions } from "./modal.ts";
import { type AnySuiComponent } from "../component.ts";
import { SuiButton } from "../components/button.ts";
import { SuiText } from "../components/text.ts";
import { SuiColumn } from "../components/column.ts";
import * as Theme from "./theme/info-modal.ts";
import { type SuiInfoModalTheme, type SuiInfoModalStateTheme } from "./theme/info-modal.ts";

/** Options for SuiInfoModal. All presentational properties live in theme. */
export type SuiInfoModalOptions = Omit<SuiModalOptions, "children"> & {
  theme?: Partial<SuiInfoModalTheme>;
};

/**
 * Simple informational modal. Stateless.
 * Renders a markdown message body and an optional dismiss button.
 * All visual and content properties (title, message text, dismiss label, styles) live in theme.
 */
export class SuiInfoModal extends SuiModal {

  private _infoTheme: SuiInfoModalTheme;

  constructor(options: SuiInfoModalOptions) {
    const merged = SuiBase.mergeTheme(
      Theme.infoModal as SuiInfoModalTheme,
      (options.theme ?? {}) as Partial<SuiInfoModalTheme>,
    );
    super({ ...options, theme: { default: { self: merged.default.self } } });
    this._infoTheme = merged;
  }

  /** Returns the resolved SuiInfoModal state theme. */
  resolveInfoTheme(): SuiInfoModalStateTheme {
    return this._infoTheme.default;
  }

  /**
   * Builds the modal body: a markdown SuiText message and an optional dismiss button.
   * Dismiss button is suppressed when theme.default.dismiss.text is undefined or empty.
   * @returns {UIPart[]}
   */
  override async compose(): Promise<UIPart[]> {
    const id = this.id;
    const t  = this.resolveInfoTheme();

    const messageText = new SuiText({
      id:    `${id}.message`,
      theme: { default: { self: { ...t.message, markdown: t.message.markdown ?? true } } },
    });

    const children: AnySuiComponent[] = [messageText];

    if (t.dismiss.text) {
      const self = this;
      children.push(new SuiButton({
        id:       `${id}.dismiss`,
        callback: async () => { await self.close(); },
        theme:    { default: { self: t.dismiss } },
      }));
    }

    return this.buildContent([new SuiColumn({
      id:       `${id}.body`,
      children,
      theme:    { default: { self: t.body ?? {} } },
    })]);
  }
}
