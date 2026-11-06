// Semantic theme tokens for the JSX UI. Values are NAI theme CSS custom
// properties (see external/theme-variables.d.ts) used as inline styles; they
// inherit through the shadow DOM, so the UI follows the writer's theme.
// `satisfies Record<string, ThemeVarRef>` keeps static colours out.
//
// No media queries exist in inline styles, so every layout is one flex layout
// that wraps: built for a phone, stretched for a desktop.

export const T = {
  bg: "var(--theme-bg0)",
  bg1: "var(--theme-bg1)",
  bg2: "var(--theme-bg2)",
  bg3: "var(--theme-bg3)",
  text: "var(--theme-text-main)",
  textHeadings: "var(--theme-text-headings)",
  textDisabled: "var(--theme-text-disabled)",
  textPlaceholder: "var(--theme-text-placeholder)",
  warning: "var(--theme-warning)",
  fontDefault: "var(--theme-font-default)",
  fontHeadings: "var(--theme-font-headings)",
  /** Done, current: green in the default theme. */
  good: "var(--theme-mid-intensity)",
  /** Hand-edited and other "yours, not ours" states. */
  cool: "var(--theme-low-intensity)",
} as const satisfies Record<string, ThemeVarRef>;

export const SP = {
  xs: "2px",
  sm: "4px",
  md: "8px",
  lg: "12px",
} as const;

/** Minimum touch target for primary controls. */
export const TOUCH = "44px";
/** Minimum height for controls in dense lists. */
export const DENSE = "36px";
