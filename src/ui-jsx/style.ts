// Semantic theme tokens for the JSX UI. Values are NAI theme CSS custom
// properties (see external/theme-variables.d.ts) consumed as inline styles;
// CSS custom properties inherit through the shadow DOM, so the UI auto-follows
// the user's active theme. `satisfies Record<string, ThemeVarRef>` enforces
// theme vars only — no static hex colors.

export const T = {
  bg: "var(--theme-bg0)",
  bg2: "var(--theme-bg2)",
  text: "var(--theme-text-main)",
  textHeadings: "var(--theme-text-headings)",
  textDisabled: "var(--theme-text-disabled)",
  warning: "var(--theme-warning)",
  fontDefault: "var(--theme-font-default)",
  // Mid-intensity is green in the default theme; SUI's sync-toggle "on" state
  // (SeFoundationSection SYNC_TOGGLE_THEME) uses the same green literal.
  midIntensity: "var(--theme-mid-intensity)",
} as const satisfies Record<string, ThemeVarRef>;

export const SP = {
  xs: "2px",
  sm: "4px",
  md: "8px",
} as const;
