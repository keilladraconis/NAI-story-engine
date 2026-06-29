/**
 * NovelAI theme CSS custom properties.
 *
 * The host sets these `--theme-*` variables on an ancestor of the script's
 * shadow host; CSS custom properties inherit through the shadow boundary, so the
 * JSX UI auto-follows the user's active theme when styles reference them via
 * `var(--theme-*)`.
 *
 * This file is hand-maintained from upstream's `generateThemeCSSVariables`
 * (the upstream `theme-css-variables.d.ts` is not distributed). Keep it in sync
 * if the host adds or renames theme variables.
 *
 * Ambient (no imports/exports) so the types below are globally available; in
 * particular `ThemeVarRef` lets style modules enforce "theme vars only, no
 * static colors".
 */

/** Color theme variables. */
type ThemeColorVar =
  | "--theme-bg0"
  | "--theme-bg1"
  | "--theme-bg2"
  | "--theme-bg3"
  | "--theme-text-main"
  | "--theme-text-headings"
  | "--theme-text-disabled"
  | "--theme-text-placeholder"
  | "--theme-text-highlight"
  | "--theme-text-prompt"
  | "--theme-text-user"
  | "--theme-text-edit"
  | "--theme-text-ai"
  | "--theme-warning"
  | "--theme-low-intensity"
  | "--theme-mid-intensity"
  | "--theme-high-intensity";

/** Font theme variables. */
type ThemeFontVar =
  | "--theme-font-default"
  | "--theme-font-code"
  | "--theme-font-headings"
  | "--theme-font-field";

/** Any NovelAI theme CSS custom property name. */
type ThemeCssVar = ThemeColorVar | ThemeFontVar;

/** A CSS `var(--theme-*)` reference, e.g. `var(--theme-mid-intensity)`. */
type ThemeVarRef = `var(${ThemeCssVar})`;
