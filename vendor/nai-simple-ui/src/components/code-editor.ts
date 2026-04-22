/**
 * @file SuiCodeEditor — wrapper around UIPartCodeEditor.
 * Monaco-based code editor with syntax highlighting. Supports a readOnly state with
 * independent visual treatment defined in theme.
 *
 * options carries data and behaviour: initialValue, onChange.
 * Editor state is persisted by sui's own storage layer — storageKey is never forwarded to the UIPart.
 * State-driving booleans (readOnly) live in state, not options.
 * All visual and structural properties (language, height, lineNumbers, wordWrap, fontSize,
 * diagnosticCodesToIgnore, style) live in theme, per state key.
 *
 * @example
 *   new SuiCodeEditor({
 *     initialValue: "",
 *     onChange:     (v) => handle(v),
 *     state:        { readOnly: false },
 *     storageKey:   "sui.my-editor",
 *     storageMode:  "memory",
 *     theme:        { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/code-editor.ts";
import {
  type SuiCodeEditorStateTheme,
  type SuiCodeEditorTheme,
} from "./theme/code-editor.ts";

/** State shape for SuiCodeEditor. readOnly drives theme resolution in resolveTheme(). */
export type SuiCodeEditorState = {
  readOnly?: boolean;
};

/**
 * options carries data and behaviour only — readOnly lives in state, visuals in theme.
 */
export type SuiCodeEditorOptions = {
  initialValue?: string;
  onChange?: (value: string) => void;
} & SuiComponentOptions<SuiCodeEditorTheme, SuiCodeEditorState>;

/**
 * Monaco code editor with two-state theme (default / readOnly).
 * language, height, lineNumbers, wordWrap, fontSize, diagnosticCodesToIgnore, and style
 * are resolved from theme via resolveTheme() based on this.state.readOnly.
 * initialValue and onChange are passed directly from options.
 */
export class SuiCodeEditor extends SuiComponent<
  SuiCodeEditorTheme,
  SuiCodeEditorState,
  SuiCodeEditorOptions,
  UIPartCodeEditor
> {
  constructor(options: SuiCodeEditorOptions) {
    super(options, Theme.codeEditor);
  }

  /** Merges active state partials onto default. readOnly stacks on top of default. */
  resolveTheme(): SuiCodeEditorStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.readOnly ? this.theme.readOnly : undefined,
    );
  }

  /**
   * Returns the UIPartCodeEditor with caller-supplied data and state-resolved theme visuals.
   * @returns {UIPartCodeEditor}
   */
  async compose(): Promise<UIPartCodeEditor> {
    const t = this.resolveTheme();
    this._composedStyle = t.self.style ?? {};
    return {
      type: "codeEditor",
      id: this.id,
      initialValue: this.options.initialValue,
      onChange: this.options.onChange,
      readOnly: this.state.readOnly,
      language: t.self.language,
      height: t.self.height,
      lineNumbers: t.self.lineNumbers,
      wordWrap: t.self.wordWrap,
      fontSize: t.self.fontSize,
      diagnosticCodesToIgnore: t.self.diagnosticCodesToIgnore,
      style: this._composedStyle,
    };
  }
}
