/**
 * @file SuiTextInput — wrapper around UIPartTextInput.
 * Single-line text input. Supports a disabled state with independent visual treatment defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange, onSubmit.
 * Input state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (disabled) live in state, not options.
 * All visual properties (label, placeholder, style) live in theme, per state key.
 *
 * @example
 *   new SuiTextInput({
 *     id:           "my-input",
 *     initialValue: "",
 *     onChange:     (v) => handle(v),
 *     onSubmit:     (v) => submit(v),
 *     state:        { disabled: false },
 *     storageKey:   "sui.my-input",
 *     storageMode:  "memory",
 *     theme:        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/text-input.ts";
import {
  type SuiTextInputStateTheme,
  type SuiTextInputTheme,
} from "./theme/text-input.ts";

/** State shape for SuiTextInput. disabled drives theme resolution in resolveTheme(). */
export type SuiTextInputState = {
  disabled?: boolean;
};

/**
 * options carries data and behaviour only — disabled lives in state, visuals in theme.
 */
export type SuiTextInputOptions = {
  initialValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
} & SuiComponentOptions<SuiTextInputTheme, SuiTextInputState>;

/**
 * Single-line text input with two-state theme (default / disabled).
 * label, placeholder, and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * initialValue, onChange, and onSubmit are passed directly from options.
 */
export class SuiTextInput extends SuiComponent<
  SuiTextInputTheme,
  SuiTextInputState,
  SuiTextInputOptions,
  UIPartTextInput
> {
  constructor(options: SuiTextInputOptions) {
    super(options, Theme.textInput);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiTextInputStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Returns the UIPartTextInput with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartTextInput}
   */
  async compose(): Promise<UIPartTextInput> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "textInput",
      id: this.id,
      initialValue: this.options.initialValue,
      onChange: this.options.onChange,
      onSubmit: this.options.onSubmit,
      disabled: this.state.disabled,
      label: t.self.label,
      placeholder: t.self.placeholder,
      style: this._composedStyle,
    };
  }
}
