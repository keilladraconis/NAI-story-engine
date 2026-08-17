// Pure derivation for the Engine HUD's modeline (design §9.1).
//
// `deriveHud` is the ONLY place under `src/ui/` that reads the loop's phase —
// exactly the arrangement `derive()` in `header/header-model.ts` has for the
// generation queue's status, and `tests/ui/hud-model.test.ts` enforces it the
// same mechanical way. Two surfaces branching on one state machine is how they
// drift out of agreement about whether the Engine is reading, acting, or stuck.
//
// It reads the loop's phase and NOT the GenX queue's status. They are different
// machines: the queue says whether a request is in flight, the loop says whether
// a pass is under way, and neither answers for the other. §9.1 is explicit about
// the separation, and the guard test asserts this whole directory never names
// the queue's slice field — hence the spelling here.
//
// The model is presentation-agnostic. `stateIcon` carries a semantic mode, not a
// glyph — `Hud.tsx` maps it to a feather icon, mounting every variant and
// toggling `display` per CLAUDE.md, so the component never branches on a phase.

import type { RootState } from "../../core/store";
import { canStartPass, type LoopPhase } from "../../core/engine/loop-machine";

/** The state slot's readings. §9.1 names five — `◉` watching · `◐` reading ·
 *  `✎` acting · `⏸` held · `⚠` stalled — over six machine phases, so `stateOf`
 *  folds two of them together. `off` is a sixth reading the design had no way to
 *  express: without it a switched-off Engine reads identically to an idle one,
 *  on the slot whose entire job is saying whether it is alive.
 *
 *  Names, not glyphs; the icons live in the component. */
export type HudState =
  "off" | "watching" | "reading" | "acting" | "held" | "stalled";

export type HudModel = {
  /** Semantic mode for the state slot, NOT a glyph. */
  stateIcon: HudState;
  /** Unread paragraphs past the watermark. Climbing = falling behind. */
  backlog: number;
  /** Open threads — context pressure. */
  threads: number;
  /** Entities revised on this branch. Always 0 until phase 6 executes intents. */
  touched: number;
  /** Filled bars out of `BUDGET_BARS`. See `budgetBarsOf`. */
  budgetBars: number;
  /** Whether the ⚡ should read as available. PRESENTATION ONLY — the real
   *  re-entry guard is in the pass effect, because `disabled` is a render-time
   *  value and a press arriving before the re-render that sets it still gets
   *  through (CLAUDE.md; §9.1). */
  zapEnabled: boolean;
};

export type HudInputs = {
  /** api.v1.script.getAllowedOutput() — not in the store, so it arrives here. */
  allowedOutput: number;
};

/** §9.1 draws the budget as four bars: `▮▮▮▯`. */
export const BUDGET_BARS = 4;

/** The output bucket §3.3 names as the only genuinely scarce resource: 2048
 *  tokens per 240 seconds. */
export const OUTPUT_BUCKET = 2048;

/** Filled bars for a remaining budget, as quarters of the bucket, rounded UP.
 *
 *  Quarters because §3.3's costs land on them legibly — a full entry rewrite is
 *  up to 1024 (two bars) and a triage is ~150 (inside one), so the bands read as
 *  capability rather than as a percentage:
 *
 *    ▮▮▮▮  1537+      a rewrite plus the triage that has to precede it
 *    ▮▮▮▯  1025-1536  a rewrite
 *    ▮▮▯▯  513-1024   a rewrite at the top of the band, or several cheap actions
 *    ▮▯▯▯  1-512      cheap actions only — triage, open, retire
 *    ▯▯▯▯  0          nothing at all
 *
 *  Rounded up rather than down so that an empty bar means literally nothing
 *  left. §9.1's compound readings hang on that: backlog climbing against an
 *  *empty* budget means starved, against a *full* one means colliding. Both
 *  readings need the extremes to be unambiguous, and `floor` would spend a
 *  quarter of the range calling a usable budget empty. The cost of `ceil` is the
 *  other end — a single remaining token shows one bar — and that is the right
 *  trade: `⏸` is the slot that says a pass actually found the reserve short.
 *
 *  Clamped because `getAllowedOutput()` is the runtime's number, not ours. */
export function budgetBarsOf(allowedOutput: number): number {
  if (!(allowedOutput > 0)) return 0; // also catches NaN
  const bars = Math.ceil(allowedOutput / (OUTPUT_BUCKET / BUDGET_BARS));
  return Math.min(bars, BUDGET_BARS);
}

/** Five slot readings over six phases (§9.1 names five icons; the machine has
 *  six phases). `triaging` reads as `◐` reading with `assessing`, because both
 *  are the pass deciding and neither writes anything to the World. `✎` acting is
 *  reserved for the phase that does, so the pencil never claims a change that
 *  did not happen. */
function stateOf(phase: LoopPhase): HudState {
  switch (phase) {
    case "idle":
      return "watching";
    case "assessing":
    case "triaging":
      return "reading";
    case "acting":
      return "acting";
    case "held":
      // Not transient. `held` persists until a later pass gets somewhere, so
      // this slot stays `⏸` across renders rather than flickering once.
      return "held";
    case "stalled":
      // `⚠` means ONLY this. Routine concurrency refusals never reach the
      // machine's failure counter (§3.4), so they never reach this slot — a slot
      // that lights up routinely is a slot the writer learns to ignore. Like
      // `held`, it persists until a pass gets somewhere.
      return "stalled";
  }
}

export function deriveHud(state: RootState, inputs: HudInputs): HudModel {
  const { engine, world } = state;

  return {
    // Off outranks every phase: a switched-off Engine is not watching, however
    // the machine's last pass left it. Without this the slot reads `watching`
    // for both "alive and waiting" and "not running" — and the slot whose whole
    // job is "whether it's alive" cannot be the one that cannot say no, on the
    // surface §9.1 builds to carry trust.
    stateIcon: engine.enabled ? stateOf(engine.phase) : "off",
    backlog: engine.backlog,
    // `world.groups.length` — `Thread` replacing `WorldGroup` is phase 5.
    threads: world.groups.length,
    // Honest 0 for the whole of this phase: nothing revises anything until
    // phase 6. A permanent 0 is correct information, and a slot that appears
    // later is a modeline that changes shape (§9.1: fixed slots, always
    // present, always in the same position).
    touched: engine.touched,
    budgetBars: budgetBarsOf(inputs.allowedOutput),
    // The ⚡ is inert when the Engine is off — the effect refuses the pass for
    // the same reason, so the appearance and the behaviour agree.
    zapEnabled: engine.enabled && canStartPass(engine),
  };
}

/** Exactly the store fields `deriveHud` reads, joined — the change-detection key
 *  `Hud.tsx` subscribes with, since `useSlice` compares snapshots by `Object.is`
 *  and `deriveHud` returns a fresh object every call. `engine.queued` is
 *  deliberately absent: the modeline has no queue slot, and repainting on it
 *  would be churn for nothing. A field read by `deriveHud` and missing here goes
 *  silently stale until the next budget tick rather than failing loudly. */
export function hudSignature(state: RootState): string {
  const { engine, world } = state;
  return [
    engine.phase,
    // Covers the state slot's "off" reading and the ⚡'s appearance — without it
    // toggling the setting leaves a stale line until something else repaints.
    engine.enabled ? "1" : "0",
    engine.backlog,
    engine.touched,
    world.groups.length,
  ].join("|");
}
