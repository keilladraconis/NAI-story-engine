// The words the World's thread surfaces put on a horizon, a status, and the
// add-thread control's standing against the cap.
//
// A `.ts` module rather than a const block inside `ThreadEditPane.tsx` for one
// reason: vitest here is `environment: "node"` over `tests/**/*.test.ts`, so a
// `.tsx` file is never collected and nothing inside one can be asserted except
// by scanning its source. What a horizon MEANS is worth testing properly —
// especially the paragraph counts, which are derived from the same table the
// forgetting detector builds its probe from and would otherwise be prose next
// to a number, free to drift the moment either moved.
//
// Icons live in the components, not here. `nai:icons/feather` is a virtual
// module the bundler provides; importing it into a module vitest collects would
// break the tests that exist to hold this file.

import { effectiveCap } from "../../../core/engine/thread-cap";
import {
  PARAGRAPH_CHARS,
  THREAD_RANGE_CHARS,
} from "../../../core/engine/thread-horizon";
import type { ThreadHorizon, ThreadStatus } from "../../../core/store/types";

/** How long a horizon may go unmentioned before its reminder starts firing, in
 *  paragraphs — the range the detector actually uses, converted.
 *
 *  Derived rather than written out. `thread-condition.ts` probes over
 *  `THREAD_RANGE_CHARS` characters and `thread-horizon.ts` says what a
 *  paragraph is; a picker that restated "about ten paragraphs" in prose would
 *  go on saying it after someone moved the range. */
export function horizonQuietParagraphs(horizon: ThreadHorizon): number {
  return Math.round(THREAD_RANGE_CHARS[horizon] / PARAGRAPH_CHARS);
}

export type HorizonOption = {
  id: ThreadHorizon;
  /** The word on the button. */
  label: string;
  /** The line under the picker while this one is chosen, and the button's own
   *  tooltip: what choosing it does, in paragraphs of prose. */
  help: string;
};

/** What each horizon is, in the writer's terms — scope first, because that is
 *  what they are choosing between; the decay follows from it. A `Record` so a
 *  fourth horizon cannot be added to the type without an answer here. */
const HORIZON_TEXT: Record<ThreadHorizon, { label: string; what: string }> = {
  point: {
    label: "Point",
    what: "A detail the story owes an answer to in the same beat",
  },
  plot: { label: "Plot", what: "A subplot that runs across scenes" },
  arc: { label: "Arc", what: "The spine — something the whole story is for" },
};

/** The horizons in the order the picker offers them: shortest scope first.
 *
 *  The same order as `HORIZON_WEIGHT` in `thread-cap.ts`, where the shortest is
 *  the first the cap gives up — so left-to-right reads as ascending commitment
 *  in both places rather than as two contradictory rankings. */
const HORIZON_ORDER: readonly ThreadHorizon[] = ["point", "plot", "arc"];

export const HORIZON_OPTIONS: readonly HorizonOption[] = HORIZON_ORDER.map(
  (id) => ({
    id,
    label: HORIZON_TEXT[id].label,
    help: `${HORIZON_TEXT[id].what}. Reminds once the story has gone about ${horizonQuietParagraphs(id)} paragraphs without mentioning it.`,
  }),
);

/** One horizon's presentation, by id. A `Record` lookup rather than a `find`
 *  over `HORIZON_OPTIONS`: the pane renders the selected horizon's help line
 *  every render, and a `find` hands it a `HorizonOption | undefined` that has
 *  to be defended against for a value the type says cannot be missing. */
export function horizonOption(horizon: ThreadHorizon): HorizonOption {
  return HORIZON_BY_ID[horizon];
}

const HORIZON_BY_ID: Record<ThreadHorizon, HorizonOption> = Object.fromEntries(
  HORIZON_OPTIONS.map((option) => [option.id, option]),
) as Record<ThreadHorizon, HorizonOption>;

export type StatusOption = {
  id: ThreadStatus;
  /** The word beside the icon. */
  label: string;
  /** What this reading means — the icon's tooltip in the World list. */
  help: string;
  /** What pressing the pane's control does from here. A tooltip that only
   *  described the current state would leave the writer guessing. */
  action: string;
};

const STATUS_TEXT: Record<ThreadStatus, StatusOption> = {
  open: {
    id: "open",
    label: "Open",
    help: "Open — the story has not settled this yet",
    action: "Mark satisfied",
  },
  satisfied: {
    id: "satisfied",
    label: "Satisfied",
    // §4.4: the model is never told a plot is over — satisfaction removes the
    // reminder rather than asserting a negative. Phase 6 is what disables the
    // entry; until then this is a flag the writer and the cap read.
    help: "Satisfied — the story has settled this",
    action: "Reopen",
  },
};

export const STATUS_OPTIONS: readonly StatusOption[] = [
  STATUS_TEXT.open,
  STATUS_TEXT.satisfied,
];

export function statusOption(status: ThreadStatus): StatusOption {
  return STATUS_TEXT[status];
}

/** The status the pane's control moves a thread to.
 *
 *  Its own function, and the value it returns is what the action carries:
 *  `threadStatusSet` takes a status, not a toggle, so a press delivered twice
 *  against the same rendered state sets the same value twice instead of
 *  walking back. That is the idempotence CLAUDE.md asks for in place of the
 *  tap debounce it forbids. */
export function nextStatus(status: ThreadStatus): ThreadStatus {
  return status === "open" ? "satisfied" : "open";
}

// ─────────────────────── the World's add-thread control ───────────────────────

export type ThreadAddModel = {
  /** Whether pressing would create a thread. Presentation AND the handler's
   *  own refusal read this — see `World.tsx`, where the press returns early on
   *  it. `disabled` alone would not do: it is a render-time value, and the
   *  reducer's cap is the backstop underneath both (CLAUDE.md). */
  enabled: boolean;
  /** Where the writer stands, drawn beside the icon on every render: `"3/8"`. */
  count: string;
  /** The button's tooltip. At the ceiling it says why the press did nothing and
   *  what to do about it — the limit lives on another tab, so nothing else on
   *  this panel can say so. */
  title: string;
};

/** What the World header's add-thread button reads as, given the list and the
 *  cap.
 *
 *  **The cap displaces; this control refuses.** §4.5's cap was designed against
 *  *triage* opening threads, where dropping the weakest is a trade the Engine
 *  chose to make. A writer pressing "+" has chosen nothing yet, and one
 *  unconfirmed click destroying a thread they authored is not that trade —
 *  deleting a thread on the same panel takes two clicks. So the reducer's
 *  invariant stays exactly as it is (it is the backstop for the Forge's
 *  `[THREAD]` and for triage in phase 6, and nothing can dispatch around it),
 *  and the hand create is refused here, visibly, before it reaches the reducer.
 *
 *  `effectiveCap` rather than the raw setting, so the number the button shows
 *  is the number `enforceThreadCap` enforces — a cap of 8.5 admits 8 in both
 *  places, and a 0 arriving from anywhere reads as 1 in both. */
export function threadAddModel(
  threadCount: number,
  cap: number,
): ThreadAddModel {
  const limit = effectiveCap(cap);
  const count = `${threadCount}/${limit}`;
  const enabled = threadCount < limit;
  return {
    enabled,
    count,
    title: enabled
      ? `Add thread (${count})`
      : `Thread limit reached (${count}) — mark one satisfied and delete it, or raise the limit in Setup → Engine`,
  };
}
