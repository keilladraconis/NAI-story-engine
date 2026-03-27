/**
 * @file SuiToolboxOption — wraps UIExtensionToolboxOption.
 * Renders an option in the writer's toolbox.
 * Optional `children` components are built and rendered in the toolbox menu when selected.
 *
 * @example
 *   const option = new SuiToolboxOption({
 *     id:          "my-toolbox-option",
 *     name:        "My Option",
 *     description: "Does something useful.",
 *     iconId:      "star" as IconId,
 *     callback:    ({ selection, text }) => { ... },
 *   });
 *   await option.register();
 */

import { SuiBase } from "../base.ts";
import { SuiExtension } from "../extension.ts";
import type { SuiBaseOptions, SuiTheme } from "../base.ts";
import type { AnySuiComponent } from "../component.ts";
import * as Theme from "./theme/toolbox-option.ts";
import { type SuiToolboxOptionStateTheme, type SuiToolboxOptionTheme } from "./theme/toolbox-option.ts";

// ============================================================
// Options
// ============================================================

export type SuiToolboxOptionOptions<
  TTheme extends SuiTheme                = SuiToolboxOptionTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Name displayed on the toolbox option's button. */
  name:         string;
  /** Description shown at the top of the toolbox menu when this option is selected. */
  description?: string;
  /** Icon displayed on the toolbox option's button. */
  iconId?:      IconId;
  /** Called when the "Adjust" button is clicked. Receives the selection and its text. */
  callback?:    ((_: { selection: DocumentSelection; text: string }) => void) | string;
  /** Optional components rendered in the toolbox menu when this option is selected. */
  children?:    AnySuiComponent[];
} & SuiBaseOptions<TTheme, TState>;

// ============================================================
// SuiToolboxOption
// ============================================================

export class SuiToolboxOption<
  TTheme extends SuiTheme                = SuiToolboxOptionTheme,
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends SuiExtension<
  "toolboxOption",
  UIExtensionToolboxOption,
  TTheme,
  TState,
  SuiToolboxOptionOptions<TTheme, TState>
> {
  constructor(options: SuiToolboxOptionOptions<TTheme, TState>, baseTheme = Theme.toolboxOption as unknown as TTheme) {
    super(options, "toolboxOption", baseTheme);
  }

  /** Returns the default state theme — SuiToolboxOption is stateless. */
  resolveTheme(): SuiToolboxOptionStateTheme {
    return (this.theme as unknown as SuiToolboxOptionTheme).default;
  }

  async compose(): Promise<UIExtensionToolboxOption> {
    const t       = this.resolveTheme();
    const content = this.options.children?.length
      ? await this.buildContent(this.options.children, SuiBase.listChildrenStyle(t.self))
      : undefined;

    return {
      type:        this.type,
      id:          this.id,
      name:        this.options.name,
      description: this.options.description,
      iconId:      this.options.iconId,
      callback:    this.options.callback,
      content,
    };
  }
}
