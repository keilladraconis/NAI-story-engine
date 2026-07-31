// Pure UIPart specs for the Story Engine header. No api.v1.ui mutation happens
// here — header-driver.ts owns every updateParts call. Keeping construction
// pure is what makes the header's four states testable without a browser.

import { SP, T } from "../style";
import type { HeaderModel, WidgetMode } from "./header-model";

export const HEADER_IDS = {
  root: "kse-root",
  header: "kse-header",
  row1: "kse-header-row1",
  row1Right: "kse-header-row1-right",
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
// set — required because updateParts replaces style wholesale. The pill radius
// and hairline border live here so the widget keeps one silhouette across all
// four states and only its colour changes.
const WIDGET_BASE = {
  padding: "3px 10px",
  fontSize: "0.8em",
  borderRadius: "999px",
  borderWidth: "1px",
  borderStyle: "solid",
  cursor: "pointer",
  whiteSpace: "nowrap",
  opacity: "1",
} as const;

export function widgetStyle(mode: WidgetMode): Record<string, string> {
  switch (mode) {
    case "continue":
      // Filled gold: the one state that needs the user to act.
      return {
        ...WIDGET_BASE,
        borderColor: T.textHeadings,
        background: T.textHeadings,
        color: T.bg,
        fontWeight: "bold",
      };
    case "cancel":
      // Salmon-red fill — a stop action, deliberately not the gold accent.
      return {
        ...WIDGET_BASE,
        borderColor: T.warning,
        background: T.warning,
        color: T.bg,
        fontWeight: "bold",
      };
    case "wait":
      return {
        ...WIDGET_BASE,
        borderColor: T.bg3,
        background: T.bg2,
        color: T.text,
        fontWeight: "normal",
      };
    case "budget":
      // Outline-only gold pill: a readout, not a call to action — but still a
      // real button, because clicking it is what clears the interaction flag.
      return {
        ...WIDGET_BASE,
        borderColor: T.textHeadings,
        background: "transparent",
        color: T.textHeadings,
        fontWeight: "normal",
      };
  }
}

/** Feather iconId per widget mode. Kept beside widgetStyle so a new mode has to
 *  answer for both its colour and its glyph in one place. */
export function widgetIcon(mode: WidgetMode): IconId {
  switch (mode) {
    case "continue":
      return "play";
    case "cancel":
      return "x";
    case "wait":
      return "clock";
    case "budget":
      return "zap";
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
            iconId: widgetIcon(model.widget.mode),
            style: widgetStyle(model.widget.mode),
            callback: handlers.onWidget,
          }),
          // The two actions are grouped so space-between pushes them together
          // against the right edge, rather than spreading all three evenly.
          api.v1.ui.part.row({
            id: HEADER_IDS.row1Right,
            alignment: "center",
            spacing: "end",
            style: { gap: SP.sm },
            content: [
              api.v1.ui.part.button({
                id: HEADER_IDS.bootstrap,
                text: model.bootstrap.text,
                iconId: "feather",
                disabled: model.bootstrap.disabled,
                // A tap can deliver click twice on mobile; bootstrap is the one
                // non-idempotent header action.
                disabledWhileCallbackRunning: true,
                style: BOOTSTRAP_STYLE,
                callback: handlers.onBootstrap,
              }),
              api.v1.ui.part.button({
                id: HEADER_IDS.import,
                iconId: "download",
                disabled: model.importDisabled,
                style: ICON_STYLE,
                callback: handlers.onImport,
              }),
            ],
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
): (Partial<UIPart> & { id: string })[] {
  const parts: (Partial<UIPart> & { id: string })[] = [];

  if (
    !prev ||
    prev.widget.text !== next.widget.text ||
    prev.widget.mode !== next.widget.mode
  ) {
    parts.push({
      id: HEADER_IDS.widget,
      text: next.widget.text,
      iconId: widgetIcon(next.widget.mode),
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
