/**
 * @file SuiMultilineTextInput — wrapper around UIPartMultilineTextInput.
 * Multi-line textarea input. Supports a disabled state with independent visual treatment defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange, onSubmit.
 * Input state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (disabled) live in state, not options.
 * All visual properties (label, placeholder, style) live in theme, per state key.
 *
 * @example
 *   new SuiMultilineTextInput({
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
import * as Theme from "./theme/multiline-text-input.ts";
import {
  type SuiMultilineTextInputStateTheme,
  type SuiMultilineTextInputTheme,
} from "./theme/multiline-text-input.ts";

/** State shape for SuiMultilineTextInput. disabled drives theme resolution in resolveTheme(). */
export type SuiMultilineTextInputState = {
  disabled?: boolean;
};

/**
 * options carries data and behaviour only — disabled lives in state, visuals in theme.
 */
export type SuiMultilineTextInputOptions = {
  initialValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
} & SuiComponentOptions<SuiMultilineTextInputTheme, SuiMultilineTextInputState>;

/**
 * Multi-line textarea with two-state theme (default / disabled).
 * label, placeholder, and style are resolved from theme via resolveTheme() based on this.state.disabled.
 * initialValue, onChange, and onSubmit are passed directly from options.
 */
export class SuiMultilineTextInput extends SuiComponent<
  SuiMultilineTextInputTheme,
  SuiMultilineTextInputState,
  SuiMultilineTextInputOptions,
  UIPartMultilineTextInput
> {
  constructor(options: SuiMultilineTextInputOptions) {
    super(options, Theme.multilineTextInput);
  }

  /** Merges active state partials onto default. disabled stacks on top of default. */
  resolveTheme(): SuiMultilineTextInputStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Returns the UIPartMultilineTextInput with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartMultilineTextInput}
   */
  async compose(): Promise<UIPartMultilineTextInput> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "multilineTextInput",
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
