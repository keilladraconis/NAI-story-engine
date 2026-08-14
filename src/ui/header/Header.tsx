// The Story Engine header: generation-state widget, Opening/Continue Scene,
// Import, and the SEGA status line. Always visible, above the tab bar.
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
  importWizardOpened,
  bootstrapRequested,
  bootstrapContinueRequested,
} from "../../core/store";
import { useSlice } from "../bridge";
import { SP, T } from "../style";
import {
  derive,
  storeSignature,
  selectBootstrapPending,
  type WidgetMode,
} from "./header-model";
import { openOpeningSceneModal } from "./opening-scene-modal";
import { Play, X, Clock, Zap, Feather, Download } from "nai:icons/feather";

/** 1s while counting down so the label ticks; 5s otherwise, which is only
 *  there to notice the output bucket silently refilling. */
const TICK_WAIT_MS = 1000;
const TICK_IDLE_MS = 5000;

const ICON_SIZE = 13;

/**
 * Re-renders the caller every `delayMs`. The header shows two things the store
 * does not hold — `getAllowedOutput()` and a wall-clock countdown — so it needs
 * a heartbeat as well as a store subscription.
 *
 * Self-rescheduling rather than an interval: api.v1.timers has no setInterval,
 * and one chain per effect run means a changed delay cannot leave a second
 * chain ticking alongside the first.
 */
function useTick(delayMs: number): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    let stopped = false;
    let pending: number | null = null;

    const arm = () => {
      void api.v1.timers
        .setTimeout(() => {
          if (stopped) return;
          pending = null;
          setTick((n) => n + 1);
          arm();
        }, delayMs)
        .then((id: number) => {
          // The creation promise can resolve after cleanup ran; clear it if so.
          if (stopped) void api.v1.timers.clearTimeout(id);
          else pending = id;
        });
    };
    arm();

    return () => {
      stopped = true;
      if (pending !== null) void api.v1.timers.clearTimeout(pending);
    };
  }, [delayMs]);
}

/**
 * Whether the story has any content yet — it picks the bootstrap button's
 * label. `initial` is read once before mount so the first paint is already
 * right; after that it is re-read whenever the document history moves or a
 * bootstrap settles, the two ways an empty story becomes non-empty.
 */
function useHasDocumentContent(initial: boolean): boolean {
  const [has, setHas] = useState(initial);
  const historyEpoch = useSlice((s) => s.runtime.historyEpoch);
  const bootstrapPending = useSlice(selectBootstrapPending);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    void api.v1.document.sectionIds().then((ids) => {
      // seq !== seqRef.current means a newer read started while this one was in
      // flight; an older read resolving later must not clobber it.
      if (seq === seqRef.current) setHas(ids.length > 0);
    });
  }, [historyEpoch, bootstrapPending]);

  return has;
}

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

function actionStyle(disabled: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: SP.sm,
    padding: "4px 8px",
    fontSize: "0.8em",
    background: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    color: T.textHeadings,
    whiteSpace: "nowrap",
    opacity: disabled ? 0.4 : 0.85,
  };
}

function iconButtonStyle(disabled: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    background: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    color: T.text,
    padding: "2px",
    opacity: disabled ? 0.4 : 1,
  };
}

export function Header(props: { initialHasDocumentContent: boolean }) {
  // Subscribing to the signature — a primitive covering exactly the fields
  // derive() reads — is what repaints the header on any relevant store change.
  useSlice(storeSignature);

  const hasDocumentContent = useHasDocumentContent(
    props.initialHasDocumentContent,
  );
  const openingModalOpen = useRef(false);

  const model = derive(store.getState(), {
    allowedOutput: api.v1.script.getAllowedOutput(),
    hasDocumentContent,
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

  // Continuing fires on the click — there is nothing to ask once the story has
  // a first page. Opening asks first: the modal collects the writer's direction
  // and dispatches on its Generate, so a dismissed modal generates nothing.
  const onBootstrap = () => {
    if (hasDocumentContent) {
      store.dispatch(bootstrapContinueRequested());
      return;
    }
    // Nothing in the store dims the button while the modal is up (no request
    // exists yet), so this is what stops a second click stacking a second modal.
    if (openingModalOpen.current) return;
    openingModalOpen.current = true;
    const release = () => {
      openingModalOpen.current = false;
    };
    // Released on rejection too — a modal that failed to open must not leave
    // the button permanently dead.
    void openOpeningSceneModal((guidance) =>
      store.dispatch(bootstrapRequested({ guidance })),
    ).then(release, release);
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
          justifyContent: "space-between",
          gap: SP.sm,
        }}
      >
        {/* Never disabled: a disabled button fires no event, so it would clear
            no FlagB — and in budget mode clearing it is the button's whole job. */}
        <button onClick={onWidget} style={widgetStyle(model.widget.mode)}>
          <WidgetIcon mode={model.widget.mode} />
          {model.widget.text}
        </button>
        {/* The two actions are grouped so space-between pushes them together
            against the right edge, rather than spreading all three evenly. */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
          <button
            disabled={model.bootstrap.disabled}
            onClick={onBootstrap}
            style={actionStyle(model.bootstrap.disabled)}
          >
            <Feather size={ICON_SIZE} />
            {model.bootstrap.text}
          </button>
          <button
            title="Import"
            disabled={model.importDisabled}
            onClick={() => store.dispatch(importWizardOpened())}
            style={iconButtonStyle(model.importDisabled)}
          >
            <Download size={16} />
          </button>
        </div>
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
