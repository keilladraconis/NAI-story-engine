// Pure UIPart specs for the Story Engine header. No api.v1.ui mutation happens
// here — header-driver.ts owns every updateParts call. Keeping construction
// pure is what makes the header's four states testable without a browser.

import { SP, T } from "../style";
import type { HeaderModel, WidgetMode } from "./header-model";

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

export type HeaderHandlers = {
  onWidget: () => void;
  onImport: () => void;
  onBootstrap: () => void;
};

// Every widgetStyle branch spreads this, so all four modes emit the same key
// set — required because updateParts replaces style wholesale.
const WIDGET_BASE = {
  padding: "4px 8px",
  fontSize: "0.8em",
  borderRadius: "4px",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

export function widgetStyle(mode: WidgetMode): Record<string, string> {
  switch (mode) {
    case "continue":
      return {
        ...WIDGET_BASE,
        background: T.textHeadings,
        color: T.bg,
        fontWeight: "bold",
        opacity: "1",
      };
    case "cancel":
      return {
        ...WIDGET_BASE,
        background: T.warning,
        color: T.bg,
        fontWeight: "bold",
        opacity: "1",
      };
    case "wait":
      return {
        ...WIDGET_BASE,
        background: T.bg2,
        color: T.text,
        fontWeight: "normal",
        opacity: "1",
      };
    case "budget":
      return {
        ...WIDGET_BASE,
        background: "transparent",
        color: T.text,
        fontWeight: "normal",
        opacity: "0.8",
      };
  }
}

/** Collapses to display:none when there is nothing to say, so the idle header
 *  costs a single row. */
export function statusStyle(statusText: string): Record<string, string> {
  return {
    display: statusText ? "block" : "none",
    fontSize: "0.8em",
    opacity: "0.8",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
}

const ICON_STYLE: Record<string, string> = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "2px",
};

const BOOTSTRAP_STYLE: Record<string, string> = {
  padding: "4px 8px",
  fontSize: "0.8em",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.textHeadings,
  whiteSpace: "nowrap",
  opacity: "0.85",
};

/** Handlers are registered once and never re-registered: updateParts only ever
 *  carries text/disabled/style. Each callback reads the live store at click
 *  time, so one static handler covers all of the widget's four modes. */
export function buildHeader(
  model: HeaderModel,
  handlers: HeaderHandlers,
): UIPart {
  return api.v1.ui.part.container({
    id: HEADER_IDS.header,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: SP.sm,
      padding: SP.sm,
      borderBottom: `1px solid ${T.bg3}`,
      flexShrink: "0",
    },
    content: [
      api.v1.ui.part.row({
        id: HEADER_IDS.row1,
        alignment: "center",
        spacing: "space-between",
        style: { gap: SP.sm },
        content: [
          // Never disabled: a disabled button fires no click and would clear
          // no FlagB, which is the entire reason this header exists.
          api.v1.ui.part.button({
            id: HEADER_IDS.widget,
            text: model.widget.text,
            style: widgetStyle(model.widget.mode),
            callback: handlers.onWidget,
          }),
          api.v1.ui.part.button({
            id: HEADER_IDS.import,
            iconId: "download",
            disabled: model.importDisabled,
            style: ICON_STYLE,
            callback: handlers.onImport,
          }),
          api.v1.ui.part.button({
            id: HEADER_IDS.bootstrap,
            text: model.bootstrap.text,
            disabled: model.bootstrap.disabled,
            // A tap can deliver click twice on mobile; bootstrap is the one
            // non-idempotent header action.
            disabledWhileCallbackRunning: true,
            style: BOOTSTRAP_STYLE,
            callback: handlers.onBootstrap,
          }),
        ],
      }),
      api.v1.ui.part.text({
        id: HEADER_IDS.status,
        text: model.statusText,
        // SEGA text may contain braces; {{...}} would be read as a storage key.
        noTemplate: true,
        style: statusStyle(model.statusText),
      }),
    ],
  });
}

/** Minimal updateParts payload between two models. `prev === null` means first
 *  push. Style objects are always complete — never a delta. */
export function patch(
  prev: HeaderModel | null,
  next: HeaderModel,
): Partial<UIPart>[] {
  const parts: Partial<UIPart>[] = [];

  if (
    !prev ||
    prev.widget.text !== next.widget.text ||
    prev.widget.mode !== next.widget.mode
  ) {
    parts.push({
      id: HEADER_IDS.widget,
      text: next.widget.text,
      style: widgetStyle(next.widget.mode),
    });
  }

  if (!prev || prev.importDisabled !== next.importDisabled) {
    parts.push({
      id: HEADER_IDS.import,
      disabled: next.importDisabled,
    });
  }

  if (
    !prev ||
    prev.bootstrap.text !== next.bootstrap.text ||
    prev.bootstrap.disabled !== next.bootstrap.disabled
  ) {
    parts.push({
      id: HEADER_IDS.bootstrap,
      text: next.bootstrap.text,
      disabled: next.bootstrap.disabled,
    });
  }

  if (!prev || prev.statusText !== next.statusText) {
    parts.push({
      id: HEADER_IDS.status,
      text: next.statusText,
      style: statusStyle(next.statusText),
    });
  }

  return parts;
}
