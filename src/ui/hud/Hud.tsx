// The Engine HUD (design §9.1): one modeline in a scriptPanel, reporting only,
// plus a single control.
//
// Fixed slots, always present, always in the same position, read as a shape
// rather than parsed as words:
//
//   ◉  14¶  ⚑5  ∆23  ▮▮▮▯  ⚡
//
// §9.1's own example line spends ✎ twice — once as the acting state, once as
// the touched count — which reads as two pencils on a line meant to be read as
// a shape. The state slot keeps the pencil (it is the state §9.1 names) and
// touched takes ∆: it is a count of changes, and the two slots can no longer be
// confused for each other at a glance.
//
// It never narrates individual actions — the journal and the log do that. What it
// rewards is watching it over time, which is why every slot is drawn on every
// render even when its number is 0: a slot that appears later is a modeline that
// changes shape.
//
// Every decision lives in `hud-model.ts`'s `deriveHud`, the one reader of the
// loop's phase. This file renders the model it hands back and branches on
// nothing else — the same split `Header.tsx` keeps with `header-model.ts`.
//
// Two structural rules, both from CLAUDE.md and both load-bearing here:
//
//   1. EVERY state icon stays mounted and toggles `display`. Never swap a
//      component *type* at a fixed position: when the re-render comes from a
//      detached callback the old svg is left behind in the DOM — and every
//      render this component does is detached, arriving from a store
//      subscription or a timer tick, never from a JSX event handler. Same
//      workaround as `Header.tsx`'s `WidgetIcon` and `ConfirmButton`.
//   2. The ⚡ carries NO re-entry guard of its own — not `disabled`, which is a
//      render-time value a press arriving before the re-render slips past, and
//      not a tap-timestamp window, which CLAUDE.md forbids reintroducing. It
//      dispatches `enginePassRequested()` and stops. The guard that matters is
//      inside the pass effect, where a second press actually lands.

import { store, enginePassRequested } from "../../core/store";
import { useSlice } from "../bridge";
import { useTick } from "../hooks";
import { SP, T } from "../style";
import {
  BUDGET_BARS,
  deriveHud,
  hudSignature,
  type HudState,
} from "./hud-model";
import {
  AlertTriangle,
  BookOpen,
  Edit3,
  Eye,
  EyeOff,
  Pause,
  Zap,
} from "nai:icons/feather";

const ICON_SIZE = 13;

/** The budget is the only slot no store change can move — `getAllowedOutput()`
 *  is the runtime's number, and the bucket refills on a clock. 5s is the
 *  header's idle cadence, and this is the same job: notice the refill. */
const TICK_MS = 5000;

/** One icon, one colour and one tooltip per reading, kept in a single table so a
 *  new `HudState` has to answer for all three in one place. Colour is the second
 *  channel the modeline reads on — `⚠` in the warning colour is the only slot
 *  that ever shouts, because it is the only one that means something is wrong. */
const STATE_ICONS: ReadonlyArray<
  readonly [HudState, IconComponent, string, string]
> = [
  // Off is first because it outranks every phase: the setting is off, so
  // whatever the machine's last pass left behind is not what the writer needs
  // to know. EyeOff rather than a dimmed Eye — "not running" and "running,
  // nothing to do" must not be two shades of the same glyph.
  ["off", EyeOff, T.textDisabled, "Off — the Engine is not running"],
  ["watching", Eye, T.text, "Watching — nothing new to read"],
  [
    "reading",
    BookOpen,
    T.textHeadings,
    "Reading — working out what needs attention",
  ],
  ["acting", Edit3, T.textHeadings, "Acting — carrying out what it decided"],
  [
    "held",
    Pause,
    T.textDisabled,
    "Held — the output budget will not cover the next step",
  ],
  [
    "stalled",
    AlertTriangle,
    T.warning,
    "Stalled — the loop cannot make progress",
  ],
];

/** Fixed bar positions. Only each bar's colour changes, so the row keeps its
 *  width and the line never reflows as the bucket drains. */
const BAR_SLOTS: ReadonlyArray<number> = Array.from(
  { length: BUDGET_BARS },
  (_, i) => i,
);

const slot = {
  display: "inline-flex",
  alignItems: "center",
  gap: SP.xs,
  whiteSpace: "nowrap",
} as const;

/**
 * All five glyphs stay mounted; `display` picks the one that is true right now.
 * See rule 1 in the file header — this is not a style preference, it is the only
 * arrangement that survives a re-render from a detached callback.
 */
function StateIcon(props: { state: HudState }) {
  return (
    <Fragment>
      {STATE_ICONS.map(([state, Icon, color, title]) => (
        <span
          key={state}
          title={title}
          style={{
            ...slot,
            display: props.state === state ? "inline-flex" : "none",
            color,
          }}
        >
          <Icon size={ICON_SIZE} color={color} />
        </span>
      ))}
    </Fragment>
  );
}

function BudgetBars(props: { filled: number; allowedOutput: number }) {
  return (
    <span
      style={{ ...slot, gap: "2px" }}
      title={`Output budget — ${props.allowedOutput} tokens left of the bucket`}
    >
      {BAR_SLOTS.map((index) => (
        <span
          key={index}
          style={{
            width: "3px",
            height: "11px",
            borderRadius: "1px",
            background: index < props.filled ? T.textHeadings : T.bg3,
          }}
        />
      ))}
    </span>
  );
}

/** Appearance only. `zapEnabled` says whether a press would do anything right
 *  now; it is deliberately NOT wired to `disabled` — see rule 2. A disabled
 *  button also fires no event, so it would clear no FlagB, and the runtime needs
 *  that flag cleared before it will refill the output bucket at all. */
function zapStyle(enabled: boolean): Record<string, string> {
  return {
    display: "inline-flex",
    alignItems: "center",
    background: "transparent",
    border: "none",
    padding: "0",
    cursor: "pointer",
    color: enabled ? T.textHeadings : T.textDisabled,
    opacity: enabled ? "1" : "0.6",
  };
}

export function Hud() {
  // A primitive covering exactly the store fields deriveHud reads, so any change
  // that moves a slot repaints the line — and nothing else does.
  useSlice(hudSignature);
  useTick(TICK_MS);

  const allowedOutput = api.v1.script.getAllowedOutput();
  const model = deriveHud(store.getState(), { allowedOutput });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SP.md,
        padding: SP.md,
        fontSize: "0.85em",
        fontFamily: T.fontDefault,
        color: T.text,
      }}
    >
      <StateIcon state={model.stateIcon} />
      <span
        style={slot}
        title="Unread paragraphs — climbing means falling behind"
      >
        {`${model.backlog}¶`}
      </span>
      <span style={slot} title="Open threads — context pressure">
        {`⚑${model.threads}`}
      </span>
      <span style={slot} title="Entities revised on this branch">
        {`∆${model.touched}`}
      </span>
      <BudgetBars filled={model.budgetBars} allowedOutput={allowedOutput} />
      {/* Never disabled, never debounced: the dispatch is the whole handler and
          the pass effect owns the refusal. */}
      <button
        onClick={() => store.dispatch(enginePassRequested())}
        title="Run a pass now"
        aria-label="Run an Engine pass now"
        style={zapStyle(model.zapEnabled)}
      >
        <Zap size={ICON_SIZE} />
      </button>
    </div>
  );
}
