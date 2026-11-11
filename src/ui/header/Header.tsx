// The sidebar header: what GLM work is doing, and the one control that answers
// it (Cancel, Continue, or the budget countdown). Silent when nothing runs.
//
// Decisions live in header-model.ts's derive(); this file only renders.

import { store } from "../../core/store";
import { cancelGlm, confirmPresence } from "../../core/engine/glm";
import { useSlice, useTokens } from "../bridge";
import { SP, T } from "../style";
import { derive, storeSignature, type WidgetMode } from "./header-model";
import { Play, X, Clock } from "nai:icons/feather";

const ICON_SIZE = 13;

/**
 * Re-renders the caller every half second while a budget wait counts down.
 * The countdown is wall-clock, not store state, so it needs its own heartbeat.
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
        }, 500)
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

const SWEEP_MS = 1400;

/**
 * A highlight sweeping across the status text while work is under way. Script
 * JSX has no <style>, so no keyframes: each sweep is a transition of the
 * gradient's position, then an instant snap back, two renders a cycle.
 */
function useShimmer(active: boolean): Record<string, string> {
  const [phase, setPhase] = useState<"snap" | "sweep">("snap");
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let pending: number | null = null;
    const step = (next: "snap" | "sweep") => {
      if (stopped) return;
      setPhase(next);
      void api.v1.timers
        .setTimeout(
          () => step(next === "snap" ? "sweep" : "snap"),
          next === "snap" ? 60 : SWEEP_MS + 200,
        )
        .then((id: number) => {
          if (stopped) void api.v1.timers.clearTimeout(id);
          else pending = id;
        });
    };
    step("sweep");
    return () => {
      stopped = true;
      if (pending !== null) void api.v1.timers.clearTimeout(pending);
    };
  }, [active]);
  if (!active) return { color: T.text };
  return {
    backgroundImage: `linear-gradient(90deg, ${T.textPlaceholder} 0%, ${T.textPlaceholder} 32%, ${T.textHeadings} 44%, ${T.textHeadings} 56%, ${T.textPlaceholder} 68%, ${T.textPlaceholder} 100%)`,
    backgroundSize: "300% 100%",
    backgroundPosition: phase === "sweep" ? "0% 0" : "100% 0",
    transition:
      phase === "sweep" ? `background-position ${SWEEP_MS}ms linear` : "none",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  };
}

export function Header() {
  useSlice(storeSignature);
  const oldest = useSlice((s) => s.runtime.jobs[0]?.id ?? "");
  const received = useTokens(oldest);
  const model = derive(store.getState(), Date.now(), received);
  const shimmer = useShimmer(model.busy);
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
      <h1
        style={{
          margin: 0,
          fontFamily: T.fontHeadings,
          fontSize: "1.05em",
          color: T.textHeadings,
        }}
      >
        Story Engine
      </h1>
      <span
        role="status"
        style={{
          ...shimmer,
          flex: "0 1 auto",
          minWidth: 0,
          fontSize: "0.85em",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {model.statusText}
      </span>
      <span style={{ flex: 1 }} />
      <button onClick={onWidget} style={widgetStyle(model.widget.mode)}>
        <WidgetIcon mode={model.widget.mode} />
        {model.widget.text}
      </button>
    </div>
  );
}
