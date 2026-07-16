// Builds the second sidebar panel that hosts the Preact tree. It is registered
// by plugin.ts in the SAME api.v1.ui.register() call as the SUI panel (NAI
// requires a single call — multiple calls overwrite each other).

import { App } from "./App";

const { sidebarPanel } = api.v1.ui.extension;

export function buildJsxSidebarPanel(): UIExtension {
  const jsxPart = api.v1.ui.part.jsx({
    id: "kse-jsx-root",
    // This `style` lands on the panel's light-DOM wrapper around our shadow host
    // (SUI panels get their fill from SuiTabBar; ours has none). A grid whose one
    // row can shrink below content (`minmax(0, 1fr)` — the responsive, pixel-free
    // equivalent of `min-height:0`) constrains the shadow host to the panel
    // height instead of letting it grow to content. Together with the Preact
    // wrapper + App both at height:100%, the chat list scrolls internally and the
    // composer pins to the bottom.
    style: {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    // captureEvents intentionally omitted — the default (no capture) lets
    // keydown and wheel pass through normally so panel inputs accept keystrokes.
    onMount: (elem) => {
      // `elem` is the (otherwise unstyled) wrapper <div> App renders into, sitting
      // between the shadow root and App's own root. Give it height:100% so App's
      // height:100% resolves against the grid-constrained host, not `auto`.
      (elem as unknown as { style: Record<string, string> }).style.height =
        "100%";
      (elem as unknown as { style: Record<string, string> }).style.minHeight =
        "0";
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
