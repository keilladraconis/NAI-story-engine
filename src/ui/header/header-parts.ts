// Pure UIPart specs for the Story Engine header. No api.v1.ui mutation happens
// here — header-driver.ts owns every updateParts call. Keeping construction
// pure is what makes the header's four states testable without a browser.

export const HEADER_IDS = {
  root: "kse-root",
  header: "kse-header",
  row1: "kse-header-row1",
  widget: "kse-widget",
  import: "kse-import",
  bootstrap: "kse-bootstrap",
  status: "kse-header-status",
} as const;

/** Grid root for the sidebar: header sized to its content, body taking the
 *  rest. The body row is `minmax(0, 1fr)` — the pixel-free equivalent of
 *  min-height:0 — so the jsx panel can shrink below its content and the chat
 *  list scrolls internally instead of growing the panel. */
export function buildRoot(header: UIPart, body: UIPart): UIPart {
  return api.v1.ui.part.container({
    id: HEADER_IDS.root,
    style: {
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    content: [header, body],
  });
}
