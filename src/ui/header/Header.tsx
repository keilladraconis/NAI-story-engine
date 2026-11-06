// The sidebar header: what GLM work is doing, and the one control that answers
// it (Cancel, Continue, or the budget countdown). Silent when nothing runs.
//
// Decisions live in header-model.ts's derive(); this file only renders.

import { store } from "../../core/store";
import { cancelGlm, confirmPresence } from "../../core/engine/glm";
import { useSlice } from "../bridge";
import { SP, T } from "../style";
import { derive, storeSignature, type WidgetMode } from "./header-model";
import { Play, X, Clock } from "nai:icons/feather";

const ICON_SIZE = 13;

/**
 * Re-renders the caller every second while a budget wait counts down. The
 * countdown is wall-clock, not store state, so it needs its own heartbeat.
 * Self-rescheduling: api.v1.timers has no setInterval.
 */
function useTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let pending: number | null = null;
    const arm = () => {
      void api.v1.timers
        .setTimeout(() => {
          if (stopped) return;
          pending = null;
          setTick((n) => n + 1);
          arm();
        }, 1000)
        .then((id: number) => {
          if (stopped) void api.v1.timers.clearTimeout(id);
          else pending = id;
        });
    };
    arm();
    return () => {
      stopped = true;
      if (pending !== null) void api.v1.timers.clearTimeout(pending);
    };
  }, [active]);
}

const WIDGET_ICONS: ReadonlyArray<readonly [WidgetMode, IconComponent]> = [
  ["continue", Play],
  ["cancel", X],
  ["wait", Clock],
];

/** Every glyph stays mounted and toggles via `display`: a component-type swap
 *  at one position leaves the old svg behind on a detached-callback render. */
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

function widgetStyle(mode: WidgetMode): Record<string, string> {
  const filled = mode === "continue" || mode === "cancel";
  const colour = mode === "cancel" ? T.warning : T.textHeadings;
  return {
    display: mode === "idle" ? "none" : "inline-flex",
    alignItems: "center",
    gap: SP.sm,
    minHeight: "32px",
    padding: "0 12px",
    borderRadius: "999px",
    border: `1px solid ${colour}`,
    background: filled ? colour : "transparent",
    color: filled ? T.bg : colour,
    fontWeight: filled ? "bold" : "normal",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export function Header() {
  useSlice(storeSignature);
  const model = derive(store.getState(), Date.now());
  useTick(model.widget.mode === "wait");

  const onWidget = () => {
    if (model.widget.mode === "continue") confirmPresence();
    else cancelGlm();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SP.md,
        padding: `${SP.md} 12px`,
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.05em", color: T.textHeadings }}>
        Story Engine
      </h1>
      <span
        style={{
          flex: "1 1 120px",
          minWidth: 0,
          fontSize: "0.85em",
          opacity: 0.8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {model.statusText}
      </span>
      <button onClick={onWidget} style={widgetStyle(model.widget.mode)}>
        <WidgetIcon mode={model.widget.mode} />
        {model.widget.text}
      </button>
    </div>
  );
}
