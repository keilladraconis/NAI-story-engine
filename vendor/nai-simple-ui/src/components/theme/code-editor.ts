/**
 * @file Theme for SuiCodeEditor.
 */

import { type PartialState, type ThemeOverride } from "../../base.ts";

export type SuiCodeEditorPartTheme = {
  language?: UIPartCodeEditor["language"];
  height?: number | string;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  fontSize?: number;
  diagnosticCodesToIgnore?: number[];
  style?: object;
};

export type SuiCodeEditorStateTheme = {
  self: SuiCodeEditorPartTheme;
};

export type SuiCodeEditorTheme = {
  default: SuiCodeEditorStateTheme;
  readOnly?: PartialState<SuiCodeEditorStateTheme>;
};

export const codeEditor = {
  default: {
    self: {},
  },
} satisfies ThemeOverride<SuiCodeEditorTheme>;
