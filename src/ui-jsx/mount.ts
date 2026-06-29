// Builds the second sidebar panel that hosts the Preact tree. It is registered
// by plugin.ts in the SAME api.v1.ui.register() call as the SUI panel (NAI
// requires a single call — multiple calls overwrite each other).

import { App } from "./App";

const { sidebarPanel } = api.v1.ui.extension;

export function buildJsxSidebarPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-root",
    // captureEvents intentionally omitted — the default (no capture) lets
    // keydown and wheel pass through normally so panel inputs accept keystrokes.
    onMount: (elem) => {
      render(h(App, null), elem);
    },
  });

  return sidebarPanel({
    id: "kse-sidebar-jsx",
    name: "Story Engine (JSX)",
    iconId: "lightning",
    content: [jsxPart],
  });
}
