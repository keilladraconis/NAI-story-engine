/**
 * @file Main barrel export for nai-simple-ui.
 * Re-exports all core bases, components, overlays, and extensions.
 *
 * Sub-barrels for direct use:
 *   - ./components  — all components and their themes
 *   - ./overlays    — all overlays and their themes
 *   - ./extensions  — all UIExtension wrappers
 */

// ── Core bases ────────────────────────────────────────────────────────────────
export * from "./base.ts";
export * from "./component.ts";
export * from "./overlay.ts";
export * from "./extension.ts";
export * from "./plugin.ts";

// ── Components + themes ───────────────────────────────────────────────────────
export * from "./components/index.ts";

// ── Overlays + themes ─────────────────────────────────────────────────────────
export * from "./overlays/index.ts";

// ── Extensions ────────────────────────────────────────────────────────────────
export * from "./extensions/index.ts";
