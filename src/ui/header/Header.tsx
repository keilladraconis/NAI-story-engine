// The Story Engine header: the generation-state widget and the SEGA status
// line. Always visible, above the tab bar. The opening scene and Import
// live on the Setup tab (src/ui/panels/setup/Setup.tsx).
//
// This was a UIPart tree driven by api.v1.ui.updateParts, because a click
// inside a jsx part did not clear the harness's FlagB interaction flag — a
// Continue or Cancel button in the Preact tree would have looked interactive
// and done nothing. The runtime now sets FlagB from JSX pointer, keyboard and
// input events, so the header lives in the Preact tree with everything else:
// no part specs, no model diffing, no updateParts driver.
//
// Decisions still live in header-model.ts's derive(); this file only renders.

import {
  store,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../core/store";
import { useSlice } from "../bridge";
import { useTick } from "../hooks";
import { SP, T } from "../style";
import { derive, storeSignature, type WidgetMode } from "./header-model";
import { Play, X, Clock, Zap } from "nai:icons/feather";

/** 1s while counting down so the label ticks; 5s otherwise, which is only
 *  there to notice the output bucket silently refilling. */
const TICK_WAIT_MS = 1000;
const TICK_IDLE_MS = 5000;

const ICON_SIZE = 13;

// The header shows two things the store does not hold — `getAllowedOutput()` and
// a wall-clock countdown — so it needs `useTick`'s heartbeat (src/ui/hooks.ts)
// as well as a store subscription. The HUD needs the same thing for the budget,
// which is why the hook lives in hooks.ts rather than here.

// Every branch spreads this, so the widget keeps one silhouette across all four
// states and only its colour changes. The border box is part of that silhouette
// even where the edge is invisible, and `opacity` is declared here so every mode
// states its own value rather than inheriting the last one's.
const WIDGET_BASE = {
  display: "inline-flex",
  alignItems: "center",
  gap: SP.sm,
  padding: "3px 10px",
  fontSize: "0.8em",
  borderRadius: "999px",
  borderWidth: "1px",
  borderStyle: "solid",
  opacity: "1",
  cursor: "pointer",
  whiteSpace: "nowrap",
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
      // Outline-only gold pill. Generation is stalled on budget and the
      // countdown is the one number worth watching, so it gets the accent the
      // idle readout gives up.
      return {
        ...WIDGET_BASE,
        borderColor: T.textHeadings,
        background: "transparent",
        color: T.textHeadings,
        fontWeight: "normal",
      };
    case "budget":
      // Recessed and border-free: idle output budget is information, not a call
      // to action, so it recedes and leaves the accent to the states that want
      // an answer. Still a real button — clicking it is one deliberate way to
      // poke the interaction flag and watch the number refill.
      //
      // The border is transparent rather than absent: dropping borderWidth
      // would shrink the pill by 2px and shift the row every time the mode
      // changes. Same box, invisible edge.
      return {
        ...WIDGET_BASE,
        borderColor: "transparent",
        background: "transparent",
        color: T.text,
        opacity: "0.7",
        fontWeight: "normal",
      };
  }
}

/** One glyph per mode. Kept beside widgetStyle so a new mode has to answer for
 *  both its colour and its icon in one place. */
const WIDGET_ICONS: ReadonlyArray<readonly [WidgetMode, IconComponent]> = [
  ["continue", Play],
  ["cancel", X],
  ["wait", Clock],
  ["budget", Zap],
];

/**
 * All four glyphs stay mounted and toggle via `display`. A conditional
 * component-type swap at one position leaves the old svg behind when the
 * re-render comes from a detached callback — a timer tick or a store
 * subscription, which is every render this header does. Keyed entries give each
 * icon its own fixed position instead. Same workaround as ConfirmButton.
 */
function WidgetIcon(props: { mode: WidgetMode }) {
  return (
    <Fragment>
      {WIDGET_ICONS.map(([mode, Icon]) => (
        <Icon
          key={mode}
          size={ICON_SIZE}
          style={{ display: props.mode === mode ? "inline-flex" : "none" }}
        />
      ))}
    </Fragment>
  );
}

export function Header() {
  // Subscribing to the signature — a primitive covering exactly the fields
  // derive() reads — is what repaints the header on any relevant store change.
  useSlice(storeSignature);

  const model = derive(store.getState(), {
    allowedOutput: api.v1.script.getAllowedOutput(),
    now: Date.now(),
  });

  useTick(model.widget.mode === "wait" ? TICK_WAIT_MS : TICK_IDLE_MS);

  const onWidget = () => {
    // The click itself is what clears the harness's FlagB. In budget mode that
    // is the whole effect and there is deliberately nothing else to do.
    const mode = model.widget.mode;
    if (mode === "continue") store.dispatch(uiUserPresenceConfirmed());
    else if (mode === "cancel" || mode === "wait")
      // Already calls genX.cancelAll() and marks the active request cancelled,
      // so this one dispatch is the whole global cancel.
      store.dispatch(uiRequestCancellation());
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        padding: SP.sm,
        borderBottom: `1px solid ${T.bg3}`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: SP.sm,
        }}
      >
        {/* Never disabled: a disabled button fires no event, so it would clear
            no FlagB — and in budget mode clearing it is the button's whole job. */}
        <button onClick={onWidget} style={widgetStyle(model.widget.mode)}>
          <WidgetIcon mode={model.widget.mode} />
          {model.widget.text}
        </button>
      </div>
      {model.statusText ? (
        <div
          style={{
            fontSize: "0.8em",
            opacity: 0.8,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {model.statusText}
        </div>
      ) : null}
    </div>
  );
}
